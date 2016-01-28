'use strict';

var s3 = require('s3'),
    _ = require('lodash'),
    shell = require('shelljs'),
    winston = require('winston'),
    fs = require('fs'),
    q = require('q'),
    log = new winston.Logger({
        transports: [
            new winston.transports.Console({
                timestamp: true,
                level: 'debug'
            }),
            new winston.transports.File({
                filename: __dirname + '/backups.log',
                level: 'debug'
            })
        ]
    });

/**
 * Checks if the configuration given is valid
 * @param  {Object}  config Config object
 * @return {Boolean}
 */
function validateConfig(config) {
    return config.accessKeyId && config.secretAccessKey && config.region && config.dbUser
        && config.dbName && config.dbPassword && Number(config.interval)
        && config.bucket;
}

/**
 * Retrieves the config options
 * @return {Object|undefined} The config object or undefined if is not valid or is missing
 */
function getConfig() {
    var config;
    try {
        config = require(__dirname + '/config.json');
    } catch (err) {
        log.error(_.template('No config.json file found at "<%= path %>"!', {
            path: __dirname
        }));
    }

    return (typeof config === 'object' && validateConfig(config)) ? config : undefined;
}

/**
 * Creates a new instance of the S3 client
 * @param  {Object} config Config object
 * @return {Object}        S3 client
 */
function createS3Client(config) {
    return s3.createClient({
        s3Options: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            region: config.region
        }
    });
}

/**
 * Generates a name for the dump file
 * @param  {String} dbName Database name
 * @return {String}        File name
 */
function generateBackupFilename(dbName) {
    return __dirname + _.template('/backup_<%= db %>_<%= time %>.sql', {
        db: dbName,
        time: new Date().getTime() + ''
    });
}

/**
 * Returns the final Key the file will have in amazon s3.
 * @param  {String} filename Filename
 * @param  {Object} config   Config object
 * @return {String}          Amazon s3 key id
 */
function getFinalFilename(filename, config) {
    var fileParts = filename.split('/'),
        name = fileParts[fileParts.length - 1];

    return config.keyPrefix ? config.keyPrefix + name : name;
}

/**
 * Dumps the mysql database to a file.
 * @param  {Object}           config Config object
 * @return {q.promise}
 */
function performBackup(config) {
    var deferred = q.defer(),
        cmdTpl = '<%= cmd %> --hex-blob -h <%= host %> -P <%= port %> -u <%= user %> -p\'<%= pass %>\' <%= database %> > <%= filename %>',
        filename = generateBackupFilename(config.dbName),
        cmd = _.template(cmdTpl, {
            cmd: config.overrideCommand || 'mysqldump',
            host: config.dbHost || 'localhost',
            port: config.dbPort || 3306,
            user: config.dbUser,
            pass: config.dbPassword,
            database: config.dbName,
            filename: filename
        });
    log.info("Running: " , cmd);
    shell.exec(cmd, {silent: true}, function (code, output) {
        if (code !== undefined && code !== 0) {
            log.error("Unable to perform a backup at " + new Date().toISOString());
            deferred.reject();
        } else {
            // we have a limitation of 20 mb, so we exec the command with the filename and dont use the stream:
            // output.to(filename);
            deferred.resolve(filename);
        }
    });

    return deferred.promise;
}


/**
 * Uploads the backup file to amazon s3
 * @param  {String}    filename Filename
 * @param  {Object}    config   Config object
 * @return {q.promise}
 */
function uploadBackup(filename, config) {
    var deferred = q.defer(),
        client = createS3Client(config),
        uploader = client.uploadFile({
            localFile: filename,
            s3Params: {
                Bucket: config.bucket,
                Key: getFinalFilename(filename, config)
            }
        });

    uploader.on('error', function (err) {
        log.error('Unable to upload file to Amazon S3 at ' + new Date().toISOString());
        deferred.reject();
    });

    uploader.on('end', function () {
        log.info(_.template('Successfully uploaded file "<%= file %>" to amazon s3', {
            file: filename
        }));
        deferred.resolve(true);
    });

    return deferred.promise;
}

/**
 * Performs the database backup
 * @param  {Object}   config Config object
 * @return {q.promie}
 */
function run(config) {
    var deferred = q.defer();

    performBackup(config).then(function (filename) {
        var remove = function () {
            fs.unlinkSync(filename);
        };

        uploadBackup(filename, config).then(function () {
            remove();
            deferred.resolve();
        }, function () {
            deferred.reject();
        });
    }, function () {
        deferred.reject();
    });

    return deferred.promise;
}

function main () {
    var config = getConfig();
    if (!config) {
        log.error('Config file is not valid!');
        return;
    }

    log.info('Starting backup daemon...');

    var action = function () {
        log.info('Performing database backup...');
        run(config).then(function () {
            log.info('Successfully performed database backup...');
        });

        setTimeout(action, Number(config.interval) * 1000);
    };
    action();
}

main();
