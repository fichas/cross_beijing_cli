export function output(data) {
  if (data.success === false) {
    console.error(`错误: ${data.message}`);
  } else {
    console.log(data.message || '');
  }
}

export function success(data, message) {
  return { success: true, data, message };
}

export function error(message, data = null) {
  return { success: false, data, message };
}
