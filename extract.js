const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = [...content.matchAll(/apiClient\.(get|post|patch|put|delete)\(\s*[\\'\"]([^\\'\"]+)[\\'\"]/g)];
      if (matches.length > 0) matches.forEach(m => results.push({ file: file.substring(file.indexOf('pigmie-web')), method: m[1], url: m[2] }));
    }
  });
  return results;
}
console.log(JSON.stringify(walk('d:/AntiGravity/Projects/PigmieFinance/pigmie-web/src'), null, 2));
