import xlrd

for filename in ['enf.xls', 'gf.xls']:
    print('='*60)
    print(f'ФАЙЛ: {filename}')
    print('='*60)
    try:
        wb = xlrd.open_workbook(f'data/{filename}')
        print(f'Листов: {wb.nsheets}')
        for i, sheet in enumerate(wb.sheets()):
            print(f'\n--- Лист {i}: "{sheet.name}" ({sheet.nrows} строк x {sheet.ncols} колонок) ---')
            for row_idx in range(min(30, sheet.nrows)):
                row = []
                for col_idx in range(sheet.ncols):
                    cell = sheet.cell(row_idx, col_idx)
                    val = str(cell.value).strip()
                    if val and val != '0.0':
                        row.append(f'[{col_idx}]:{repr(val)[:50]}')
                if row:
                    print(f'  Строка {row_idx:2d}: {" | ".join(row)}')
    except Exception as e:
        print(f'Ошибка: {e}')
    print()
