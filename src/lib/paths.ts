import path from 'path';

/**
 * 处理过程中临时文件的存放目录。
 * 可通过 TEMP_STORAGE_DIR 指定（自建服务器建议挂载持久化卷到此路径）。
 * 默认：生产环境为 /tmp/substudio，开发环境为 public/temp。
 */
export function getStorageDir(): string {
    if (process.env.TEMP_STORAGE_DIR) return process.env.TEMP_STORAGE_DIR;
    return process.env.NODE_ENV === 'production'
        ? path.join('/tmp', 'substudio')
        : path.join(process.cwd(), 'public', 'temp');
}
