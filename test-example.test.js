// 测试示例文件
import { readFileSync, existsSync } from 'fs';

function testExampleFile() {
  console.log('测试开始...');
  
  // 测试文件是否存在
  if (!existsSync('test-example.txt')) {
    throw new Error('示例文件不存在');
  }
  console.log('✓ 文件存在');
  
  // 测试文件内容
  const content = readFileSync('test-example.txt', 'utf-8');
  if (!content.includes('测试示例文件')) {
    throw new Error('文件内容不正确');
  }
  console.log('✓ 文件内容正确');
  
  console.log('所有测试通过！');
}

testExampleFile();