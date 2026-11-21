import os, re

for root, dirs, files in os.walk('src/app/api'):
    for f in files:
        if f == 'route.ts':
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8') as fp:
                c = fp.read()
                if 'export async function DELETE' in c:
                    print(p)
                    for line in c.splitlines():
                        if 'DELETE' in line or 'params' in line or 'require' in line:
                            print('  ', line.strip()[:100])
