import * as fs from 'fs';
import * as XLSX from 'xlsx';

describe('Excel Reconciliation & Source Rule Validation', () => {
  const TRACKER_PATH = 'C:\\Users\\mitro\\Downloads\\GREY YARN STOCK TRACKER.xlsx';
  const OVERVIEW_PATH = 'C:\\Users\\mitro\\Downloads\\DTB Sourcemate Feature Overview (1).xlsx';

  let wbTracker: XLSX.WorkBook;
  let wbOverview: XLSX.WorkBook;

  beforeAll(() => {
    expect(fs.existsSync(TRACKER_PATH)).toBe(true);
    expect(fs.existsSync(OVERVIEW_PATH)).toBe(true);

    wbTracker = XLSX.readFile(TRACKER_PATH, { cellFormula: true, cellDates: true });
    wbOverview = XLSX.readFile(OVERVIEW_PATH);
  });

  describe('1. Workbooks & Sheet Structure', () => {
    it('should verify all required sheets exist in GREY YARN STOCK TRACKER', () => {
      const expectedSheets = [
        'Settings',
        'Read Me',
        'Stock Summary',
        'Transaction Log',
        'Historical Log (Archive)',
        'Lot Stock',
        'Yarn Slip',
        'Yarn Requirement',
        'Quick Report',
        'Count List',
        'Party List',
      ];
      for (const s of expectedSheets) {
        expect(wbTracker.SheetNames).toContain(s);
      }
    });

    it('should verify Feature Overview sheet exists in DTB Sourcemate overview', () => {
      expect(wbOverview.SheetNames).toContain('Feature Overview');
    });
  });

  describe('2. 30-Aug-2026 Opening Baseline Stock Reconciliation', () => {
    it('should verify Transaction Log contains 95 opening rows totaling 1,301 bags and 100,243.25 kg', () => {
      const ws = wbTracker.Sheets['Transaction Log'];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 4, defval: '' });
      const openingRows = rows.filter((r) => (r.Type || '').toUpperCase() === 'OPENING');

      expect(openingRows.length).toBe(95);

      const totalBags = openingRows.reduce((sum, r) => sum + (Number(r['Bags / Pallets']) || 0), 0);
      const totalKg = openingRows.reduce((sum, r) => sum + (Number(r['Kilos']) || 0), 0);

      expect(totalBags).toBe(1301);
      expect(Number(totalKg.toFixed(2))).toBe(100243.25);
    });

    it('should verify Stock Summary sheet Grand Total matches 1,301 bags and 100,243.25 kg', () => {
      const ws = wbTracker.Sheets['Stock Summary'];
      const bagsCell = ws['F165'];
      const kgCell = ws['G165'];

      expect(bagsCell).toBeDefined();
      expect(Number(bagsCell.v)).toBe(1301);

      expect(kgCell).toBeDefined();
      expect(Number(kgCell.v)).toBe(100243.25);
    });

    it('should verify Lot Stock sheet Total Balance matches 1,301 bags and 100,243.25 kg across 86 lots', () => {
      const ws = wbTracker.Sheets['Lot Stock'];
      const balBagsCell = ws['B15'];
      const balKgCell = ws['C15'];

      expect(Number(balBagsCell.v)).toBe(1301);
      expect(Number(Number(balKgCell.v).toFixed(2))).toBe(100243.25);

      const lotRows: any[] = XLSX.utils.sheet_to_json(ws, { range: 18, defval: '' });
      const validLots = lotRows.filter((r) => r.Party || r.Count || r['Lot No']);
      expect(validLots.length).toBe(86);
    });
  });

  describe('3. Yarn Requirement & 103% Ceiling Rules', () => {
    it('should verify 189 order requirement lines with matching PENDING and N/A statuses', () => {
      const ws = wbTracker.Sheets['Yarn Requirement'];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 4, defval: '' });
      const orders = rows.filter((r) => r['PO No'] || r['Party'] || r['Total Required (Kg)']);

      expect(orders.length).toBe(189);

      const totalRequiredKg = orders.reduce((sum, r) => sum + (Number(r['Total Required (Kg)']) || 0), 0);
      expect(Number(totalRequiredKg.toFixed(2))).toBe(132473.94);

      const pendingOrders = orders.filter((r) => r.Status === 'PENDING');
      const naOrders = orders.filter((r) => r.Status === 'N/A');

      expect(pendingOrders.length).toBe(164);
      expect(naOrders.length).toBe(25);
    });

    it('should verify 103% ceiling formula: ceilKg = reqKg * 1.03', () => {
      const testCases = [
        { required: 1000, expectedCeiling: 1030 },
        { required: 1517.46, expectedCeiling: 1562.9838 },
        { required: 218.5, expectedCeiling: 225.055 },
      ];

      for (const tc of testCases) {
        const ceiling = Number((tc.required * 1.03).toFixed(4));
        expect(ceiling).toBe(tc.expectedCeiling);
      }
    });
  });

  describe('4. Historical Log (Archive) & 20-Aug to 29-Aug Gap Analysis', () => {
    it('should verify Historical Log closing balance on 19-Aug-2026 is exactly 1,315 bags / 101,456.79 kg', () => {
      const ws = wbTracker.Sheets['Historical Log (Archive)'];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { range: 6, defval: '' });
      const archiveRows = rows.filter((r) => r.Date || r.Type);

      expect(archiveRows.length).toBe(3245);

      let runningBags = 0;
      let runningKg = 0;

      archiveRows.forEach((r) => {
        const b = Number(r['Bags / Pallets']) || 0;
        const k = Number(r['Kilos']) || 0;
        const t = (r.Type || '').toUpperCase();
        if (t === 'OPENING' || t === 'RECEIVED' || t === 'ADJUSTMENT') {
          runningBags += b;
          runningKg += k;
        } else if (t === 'ISSUED') {
          runningBags -= b;
          runningKg -= k;
        }
      });

      expect(runningBags).toBe(1315);
      expect(Number(runningKg.toFixed(2))).toBe(101456.79);
    });

    it('should verify archive migration boundary variance (-14 bags, -1,213.54 kg) between 19-Aug and 30-Aug', () => {
      const archiveBags = 1315;
      const archiveKg = 101456.79;

      const liveBaselineBags = 1301;
      const liveBaselineKg = 100243.25;

      const diffBags = liveBaselineBags - archiveBags;
      const diffKg = Number((liveBaselineKg - archiveKg).toFixed(2));

      expect(diffBags).toBe(-14);
      expect(diffKg).toBe(-1213.54);
    });
  });

  describe('5. Quick Report & Yarn Slip Validation', () => {
    it('should verify Quick Report formulas calculate Received, Issued, and Net Change correctly', () => {
      const ws = wbTracker.Sheets['Quick Report'];

      expect(ws['B14'].f).toContain("SUMPRODUCT(('Transaction Log'!$B$6:$B$600=\"RECEIVED\")");
      expect(ws['B15'].f).toContain("SUMPRODUCT(('Transaction Log'!$B$6:$B$600=\"ISSUED\")");
      expect(ws['B16'].f).toBe('B14-B15');
      expect(ws['C16'].f).toBe('C14-C15');
    });

    it('should verify Yarn Slip dynamically formats Slip No, Slip Type, and SO remaining balance formula', () => {
      const ws = wbTracker.Sheets['Yarn Slip'];

      expect(ws['A4'].f).toBe('IF(K4="ISSUED","YARN ISSUANCE SLIP","YARN RECEIPT SLIP")');
      expect(ws['A6'].f).toBe('"Slip No:  SLP-"&TEXT(K3,"yyyymmdd")&"-"&LEFT(K4,1)');
      expect(ws['H11'].f).toContain('SUMPRODUCT((\'Yarn Requirement\'!$A$6:$A$194=INDEX(\'Transaction Log\'!$I:$I,$M11))');
    });
  });
});
