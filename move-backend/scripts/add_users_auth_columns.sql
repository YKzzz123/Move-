-- 若已存在会报错，可忽略对应语句后手工检查。
-- 适用于 MySQL 8+，库名与表名与项目一致时执行。

ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255) NULL;
CREATE UNIQUE INDEX uq_users_username ON users (username);
