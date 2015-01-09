#mysql-s3-backup

mysql-s3-backup allows you to perform a backup of your database and store it in an Amazon S3 bucket.

## Installation

```bash
git clone https://github.com/mvader/mysql-s3-backup
cd mysql-s3-backup
cp config.sample.json config.json
```

Now you must edit the ```config.json``` file to configure the backups.

### Configuration

* **accessKeyId**: Amazon s3 access key.
* **secretAccessKey**: Amazon s3 access secret.
* **dbUser**: database user.
* **dbHost**: database host, localhost by default.
* **dbPort**: database port, 3306 by default.
* **dbName**: database name.
* **dbPassword**: database password.
* **interval**: number of seconds between backups.
* **bucket**: bucket where the backups will be stored.
* **keyPrefix**: prefix for the amazon file name.
* **overrideCommand**: if your mysqldump is not accessible through console as 'mysqldump ...' change it for its location. Example: MAMP has the mysqldump binary in /Applications/MAMP/Library/bin/mysqldump and it's not in the path.

### Running mysql-s3-backup

Just:
```bash
node index.js
```

You can also run it with forever.
```bash
npm install -g forever
forever start index.js
```