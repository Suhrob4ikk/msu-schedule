import xlrd
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

for filename in ['enf.xls', 'gf.xls']:
    print('='*70)
    print(f'ФАЙЛ: {filename}')
    print('='*70)
    try:
        wb = xlrd.open_workbook(f'data/{filename}', encoding_override='cp1251')
        print(f'Листов: {wb.nsheets}, имена: {wb.sheet_names()}')

        for i, sheet in enumerate(wb.sheets()):
            print(f'\n{"="*50}')
            print(f'ЛИСТ {i}: "{sheet.name}" ({sheet.nrows} строк x {sheet.ncols} столбцов)')
            print(f'{"="*50}')
            for row_idx in range(sheet.nrows):
                row_data = []
                for col_idx in range(sheet.ncols):
                    cell = sheet.cell(row_idx, col_idx)
                    val = str(cell.value).strip()
                    if val and val not in ('0.0', ''):
                        row_data.append(f'[{col_idx}]="{val[:80]}"')
                if row_data:
                    print(f'  Строка {row_idx:2d}: {" | ".join(row_data)}')
    except Exception as e:
        print(f'Ошибка: {e}')
        import traceback
        traceback.print_exc()
    print()
