import glob, csv, io, openpyxl, datetime

UP = '/root/.claude/uploads/3a5771dc-f709-512f-9987-28d6fc5670c8/'
TODAY = '2026-08-06'
RBI_URL = 'https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook+of+Statistics+on+Indian+States'

NAME_MAP = {
    'jammu & kashmir': 'Jammu and Kashmir', 'andaman & nicobar islands': 'Andaman and Nicobar Islands',
    'andaman and nicobar islands': 'Andaman and Nicobar Islands',
    'chhatisgarh': 'Chhattisgarh', 'chhattisgarh': 'Chhattisgarh', 'pondicherry': 'Puducherry',
    'orissa': 'Odisha', 'uttaranchal': 'Uttarakhand', 'nct of delhi': 'Delhi', 'delhi': 'Delhi',
    'all india': 'India', 'all-india': 'India', 'telengana': 'Telangana',
}
VALID = set("""Andhra Pradesh,Arunachal Pradesh,Assam,Bihar,Chhattisgarh,Goa,Gujarat,Haryana,Himachal Pradesh,
Jammu and Kashmir,Jharkhand,Karnataka,Kerala,Madhya Pradesh,Maharashtra,Manipur,Meghalaya,Mizoram,Nagaland,Odisha,
Punjab,Rajasthan,Sikkim,Tamil Nadu,Telangana,Tripura,Uttar Pradesh,Uttarakhand,West Bengal,India,Delhi,Puducherry,
Chandigarh,Lakshadweep,Ladakh,Andaman and Nicobar Islands""".replace('\n','').split(','))

def norm_state(raw, year=None):
    if raw is None: return None
    s = str(raw).strip().rstrip('*#').strip()
    if not s or s.lower().startswith(('note','source','-','*','state/','year')): return None
    mapped = NAME_MAP.get(s.lower(), s)
    if mapped in VALID: return mapped
    if s.lower().startswith('dadra'):
        return 'Dadra and Nagar Haveli and Daman and Diu' if (year and year >= 2020) else 'Dadra and Nagar Haveli'
    if s.lower().startswith('daman'): return None  # included in DNH per footnote
    return None

def num(v):
    if v is None: return None
    s = str(v).strip().replace(',', '')
    if s in ('', '-', '--', 'NA', 'N.A.', 'n.a.', '..'): return None
    try: return float(s)
    except ValueError: return None

rows = []
def emit(ind, state, year, value, title, org, period, note=''):
    rows.append([ind, state, year, value, title, RBI_URL, period, org, note, TODAY])

def year_of(header):  # '1993-94' -> 1993 ; 2004 -> 2004
    s = str(header).strip()
    return int(s[:4])

def simple_year_table(path, sheet, indicator, title, org, split_period=False, dnh_note=''):
    ws = openpyxl.load_workbook(path, data_only=True)[sheet]
    grid = [[c for c in r] for r in ws.iter_rows(values_only=True)]
    hdr_i = next(i for i, r in enumerate(grid)
                 if any(str(c).strip().lower() in ('state/union territory', 'year') for c in r if c))
    hdr = grid[hdr_i]
    ycols = [(j, year_of(c), str(c).strip()) for j, c in enumerate(hdr) if c and str(c).strip()[:4].isdigit()]
    for r in grid[hdr_i + 1:]:
        first = next((c for c in r if c is not None and str(c).strip()), None)
        for j, yr, label in ycols:
            v = num(r[j])
            if v is None: continue
            st = norm_state(first, yr)
            if not st: continue
            note = dnh_note if st.startswith('Dadra') else ''
            emit(indicator, st, yr, v, title, org, label if split_period else str(yr), note)

# Table 4: IMR (existing indicator)
for sheet in ('T_4(i)', 'T_4(ii)'):
    simple_year_table(UP + '27ba9893-4T_11122025025F203A250E46CAB963946C776ADBAF.XLSX', sheet,
        'infant-mortality-rate',
        'RBI Handbook of Statistics on Indian States, Table 4: State-wise Infant Mortality Rate',
        'Office of the Registrar General (SRS)',
        dnh_note='RBI footnote: figures for Dadra & Nagar Haveli include Daman & Diu.')

# Table 6: TFR (new indicator)
for sheet in ('T_6(i)', 'T_6(ii)'):
    simple_year_table(UP + 'f4c50c95-6T_11122025339F4339AA23421F863E7B21428C8460.XLSX', sheet,
        'total-fertility-rate',
        'RBI Handbook of Statistics on Indian States, Table 6: State-wise Total Fertility Rate',
        'Office of the Registrar General (SRS)')

# Tables 8/9: unemployment overall (rural/urban), survey years
simple_year_table(UP + '3e431fd8-8T_111220254070338D01844B439710F4990CDAF4DF.XLSX', 'T_8(iii)',
    'unemployment-rate-rural',
    'RBI Handbook of Statistics on Indian States, Table 8: State-wise Unemployment Rate, Usual Status Adjusted (Rural Overall)',
    'NSO (NSSO EUS / PLFS)', split_period=True)
simple_year_table(UP + '09bf9e52-9T_11122025FD98FA2EE6704C18AB8D5EC9966548B6.XLSX', 'T_9(iii)',
    'unemployment-rate-urban',
    'RBI Handbook of Statistics on Indian States, Table 9: State-wise Unemployment Rate, Usual Status Adjusted (Urban Overall)',
    'NSO (NSSO EUS / PLFS)', split_period=True)

# Table 1: GER secondary total (last column N = index 13), year from title
wb = openpyxl.load_workbook(UP + 'b869a432-1T_11122025F08514EBAFB142FEA1EE504EC9CA95E5.XLSX', data_only=True)
for sheet in ('T_1(i)', 'T_1(ii)', 'T_1(iii)'):
    ws = wb[sheet]
    grid = [[c for c in r] for r in ws.iter_rows(values_only=True)]
    title_row = next(r for r in grid if any(c and 'GROSS ENROLMENT' in str(c) for c in r))
    period = str([c for c in title_row if c][0]).split('-', 1)[-1].strip()  # e.g. '2022-23'
    period = str([c for c in title_row if c][0]).rsplit('- ', 1)[-1].strip()
    yr = int(period[:4])
    hdr_i = next(i for i, r in enumerate(grid) if any(str(c).strip().lower() == 'state/union territory' for c in r if c))
    for r in grid[hdr_i + 2:]:
        first = next((c for c in r if c is not None and str(c).strip()), None)
        st = norm_state(first, yr)
        if not st: continue
        v = num(r[13])
        if v is None: continue
        emit('ger-secondary', st, yr, v,
             f'RBI Handbook of Statistics on Indian States, Table 1: State-wise Gross Enrolment Ratio {period}',
             'Ministry of Education (UDISE+)', f'UDISE+ {period}',
             'NEP 2020 stage: Secondary covers Classes IX to XII (total).')

buf = io.StringIO()
w = csv.writer(buf)
w.writerow('indicator,state,year,value,source_title,source_url,reporting_period,reporting_org,notes,verified_on'.split(','))
for r in rows:
    w.writerow(r)
open('rbi_values.csv', 'w').write(buf.getvalue())

from collections import Counter
c = Counter(r[0] for r in rows)
print('rows per indicator:', dict(c))
print('total:', len(rows))
# spot checks against the printed tables
def find(ind, st, yr):
    return [r[3] for r in rows if r[0]==ind and r[1]==st and r[2]==yr]
print('IMR AP 2004 (expect 59):', find('infant-mortality-rate','Andhra Pradesh',2004))
print('IMR India 2023 (expect ~26?):', find('infant-mortality-rate','India',2023))
print('TFR Bihar 2003 (expect 4.2):', find('total-fertility-rate','Bihar',2003))
print('UR-urban India 1993 (expect 40):', find('unemployment-rate-urban','India',1993))
print('UR-rural AP 2023 (expect 34):', find('unemployment-rate-rural','Andhra Pradesh',2023))
print('GER-sec AP 2024 (expect 78.5):', find('ger-secondary','Andhra Pradesh',2024))
print('DNH IMR rows:', [(r[2], r[3]) for r in rows if r[0]=='infant-mortality-rate' and r[1].startswith('Dadra')][:4])
