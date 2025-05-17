export class ErrorHandler {
  static handleUploadError(error) {
    let message = '上传失败';
    
    // 根据响应状态码提供更具体的错误信息
    if (error.response) {
      switch (error.response.status) {
        case 413:
          message = '文件太大';           // 请求实体太大
          break;
        case 415:
          message = '不支持的文件类型';    // 不支持的媒体类型
          break;
        case 401:
          message = '未授权，请重新登录';  // 未授权
          break;
        default:
          message = `上传错误: ${error.response.status}`;
      }
    }
    
    return message;
  }
}
