const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../js/exports.js');

test('CSV对逗号、双引号和换行字段正确转义，保留中文与UTF-8 BOM', () => {
  assert.equal(toCsv([{ name: '图书馆,北区', note: '他说"你好"\n第二行', address: '校园\r南门' }]),
    '\uFEFFname,note,address\r\n"图书馆,北区","他说""你好""\n第二行","校园\r南门"');
});

test('CSV按列名对齐不同对象顺序，保留0和false并为空值留空', () => {
  assert.equal(toCsv([{ name: 'A', value: 0 }, { value: false, name: 'B', note: null }]),
    '\uFEFFname,value,note\r\nA,0,\r\nB,false,');
});

test('空数据可以导出，CSV格式化不修改源数据', () => {
  assert.equal(toCsv([]), '\uFEFF');
  const data = Object.freeze([Object.freeze({ name: '南门', category: '学校大门' })]);
  assert.equal(toCsv(data), '\uFEFFname,category\r\n南门,学校大门');
});
