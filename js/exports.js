// 数据格式化与浏览器下载；格式化函数也供 Node.js 回归测试使用。
(function () {
  function toCsv(data) {
    const headers = [...new Set(data.flatMap(item => Object.keys(item)))];
    const escapeCell = value => {
      const text = value == null ? '' : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    if (headers.length === 0) return '\uFEFF';
    const rows = [headers.map(escapeCell).join(',')];
    for (const item of data) rows.push(headers.map(key => escapeCell(item[key])).join(','));
    return '\uFEFF' + rows.join('\r\n');
  }

  function downloadData(data, format, fileName) {
    const content = format === 'csv' ? toCsv(data) : JSON.stringify(data, null, 2);
    const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}_${Date.now()}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function init({ featurePoints }) {
    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      downloadData(featurePoints, 'json', '校园建筑属性');
      alert('JSON数据已导出。');
    });
    document.getElementById('exportExcelBtn').addEventListener('click', () => {
      downloadData(featurePoints, 'csv', '校园建筑属性');
      alert('CSV数据已导出。');
    });
  }

  const api = { init, toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.CampusExports = api;
})();
