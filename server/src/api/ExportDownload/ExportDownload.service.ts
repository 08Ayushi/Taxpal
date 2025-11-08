import PDFDocument from 'pdfkit';
import { format as fmt } from 'date-fns';
import { PassThrough } from 'stream';

import FinancialReportModel from '../FinancialReport/FinancialReport.model';
import Transaction from '../transaction/Transaction.model';

/**
 * Create XLSX buffer from AOA rows.
 * - Uses UTF-8 safe content
 * - Applies column widths so dates/amounts display correctly
 */
async function makeXlsx(rows: any[][], sheetName = 'Sheet1'): Promise<Buffer> {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths for A..F so Excel doesn't show #######
    // 0=Report/#, 1=Period/Date, 2=Type, 3=Category, 4=Description, 5=Amount
    ws['!cols'] = [
      { wch: 14 }, // Report / #
      { wch: 26 }, // Period / Date
      { wch: 12 }, // Type
      { wch: 18 }, // Category
      { wch: 32 }, // Description
      { wch: 14 }  // Amount
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return Buffer.from(
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as any
    );
  } catch {
    throw new Error(
      'XLSX export requires the "xlsx" package. Install it with: npm i xlsx'
    );
  }
}

/**
 * Simple CSV builder with escaping.
 * (Dates are plain text; if Excel shows garbage for the dash, it's its ANSI
 *  default. Import as UTF-8 or just use this as-is.)
 */
function makeCsv(rows: any[][]): Buffer {
  const lines = rows.map((r) =>
    r
      .map((v) => {
        const s = (v ?? '').toString();
        return /[",\n]/.test(s)
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(',')
  );
  return Buffer.from(lines.join('\n'), 'utf8');
}

/**
 * Collect all transactions for the report range and compute totals.
 */
async function getTransactionsData(
  dateFrom: Date,
  dateTo: Date,
  createdBy?: any
): Promise<{
  transactions: any[];
  totalTransactions: number;
  totalIncome: number;
  totalExpense: number;
  net: number;
}> {
  try {
    const filter: any = {
      date: { $gte: dateFrom, $lte: dateTo }
    };

    if (createdBy) {
      filter.userId = createdBy;
    }

    const txs = await Transaction.find(filter)
      .sort({ date: 1 })
      .lean()
      .exec();

    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of txs) {
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'income') {
        totalIncome += amount;
      } else if (tx.type === 'expense') {
        totalExpense += amount;
      }
    }

    const net = totalIncome - totalExpense;

    return {
      transactions: txs,
      totalTransactions: txs.length,
      totalIncome,
      totalExpense,
      net
    };
  } catch (err) {
    console.error('[ExportDownload] getTransactionsData error:', err);
    return {
      transactions: [],
      totalTransactions: 0,
      totalIncome: 0,
      totalExpense: 0,
      net: 0
    };
  }
}

/**
 * Draw a proper transactions table in the PDF:
 * - Shaded bold header
 * - Borders between rows
 * - Auto-paginates with header repeated
 */
function drawTransactionsTable(
  doc: PDFDocument,
  startY: number,
  rows: any[][]
) {
  const pageWidth = doc.page.width;
  const margin = doc.page.margins.left;
  const usableWidth = pageWidth - margin - doc.page.margins.right;

  const baseColWidths = [
    30,   // #
    80,   // Date
    65,   // Type
    90,   // Category
    220,  // Description
    70    // Amount
  ];

  const totalBase = baseColWidths.reduce((a, b) => a + b, 0);
  const scale = totalBase > usableWidth ? usableWidth / totalBase : 1;
  const widths = baseColWidths.map((w) => w * scale);

  const header = ['#', 'Date', 'Type', 'Category', 'Description', 'Amount'];
  const rowHeight = 18;
  const headerHeight = 22;

  const drawHeader = () => {
    let x = margin;
    const y = doc.y;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');

    // background
    doc
      .save()
      .rect(margin, y, usableWidth, headerHeight)
      .fill('#F2F2F2')
      .restore();

    header.forEach((text, i) => {
      doc.text(text, x + 4, y + 6, {
        width: widths[i] - 8,
        align: i === header.length - 1 ? 'right' : 'left'
      });
      x += widths[i];
    });

    // underline
    doc
      .moveTo(margin, y + headerHeight)
      .lineTo(margin + usableWidth, y + headerHeight)
      .lineWidth(0.5)
      .stroke('#CCCCCC');

    doc.moveDown(0.4);
  };

  const ensureSpace = (needed: number) => {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + needed > bottom) {
      doc.addPage();
      drawHeader();
    }
  };

  doc.y = startY;
  drawHeader();

  if (!rows.length) {
    ensureSpace(rowHeight);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#444444')
      .text('No transactions found for the selected period.', margin, doc.y + 4);
    return;
  }

  doc.font('Helvetica').fontSize(10).fillColor('#000000');

  rows.forEach((r) => {
    ensureSpace(rowHeight);

    let x = margin;
    const y = doc.y + 2;

    r.forEach((cell, i) => {
      const text = String(cell ?? '');
      const align =
        i === 0 || i === header.length - 1 ? 'right' : 'left';

      doc.text(text, x + 4, y, {
        width: widths[i] - 8,
        align
      });
      x += widths[i];
    });

    const lineY = y + rowHeight - 6;
    doc
      .moveTo(margin, lineY)
      .lineTo(margin + usableWidth, lineY)
      .lineWidth(0.25)
      .stroke('#E5E5E5');

    doc.y = y + rowHeight - 8;
  });
}

export async function buildReportBuffer(opts: {
  reportId?: string;
  reportType: 'income-statement' | 'balance-sheet' | 'cash-flow';
  format: 'pdf' | 'csv' | 'xlsx';
}) {
  if (!opts.reportId) {
    throw new Error('reportId is required to export');
  }

  const rep = await FinancialReportModel.findById(opts.reportId).lean();
  if (!rep) {
    throw new Error('Report not found');
  }

  const toValidDate = (v: any, fallback?: Date) => {
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
  };

  const dateFrom: Date = toValidDate(rep.dateFrom);
  const dateTo: Date = toValidDate(rep.dateTo);
  if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
    throw new Error('Invalid report dates (dateFrom/dateTo)');
  }

  const periodLabel: string = rep.periodLabel || 'Period';
  const reportType =
    (rep.reportType as
      | 'income-statement'
      | 'balance-sheet'
      | 'cash-flow') || opts.reportType;

  // ==== Pull transactions & compute summary ====
  const {
    transactions,
    totalTransactions,
    totalIncome,
    totalExpense,
    net
  } = await getTransactionsData(dateFrom, dateTo, rep.createdBy);

  const reportTitle = String(reportType)
    .replace('-', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Every date we put into rows below is a STRING (not Date object)
  const detailRows = transactions.map((t, idx) => [
    idx + 1,
    fmt(new Date(t.date), 'dd-MMM-yyyy'),
    String(t.type || '').toUpperCase(),
    t.category || '',
    t.description || '',
    (Number(t.amount) || 0).toFixed(2)
  ]);

  // Shared tabular representation (CSV/XLSX)
  const periodText = `${fmt(
    dateFrom,
    'dd-MMM-yyyy'
  )} to ${fmt(dateTo, 'dd-MMM-yyyy')} (${periodLabel})`;

  const rows: any[][] = [
    ['Report', reportTitle],
    ['Period', periodText],
    ['Total Transactions', totalTransactions],
    ['Total Income', totalIncome.toFixed(2)],
    ['Total Expense', totalExpense.toFixed(2)],
    ['Net', net.toFixed(2)],
    [],
    ['#', 'Date', 'Type', 'Category', 'Description', 'Amount'],
    ...detailRows
  ];

  // ===== CSV =====
  if (opts.format === 'csv') {
    const buf = makeCsv(rows);
    return {
      filename: 'report.csv',
      mime: 'text/csv',
      buf
    };
  }

  // ===== XLSX =====
  if (opts.format === 'xlsx') {
    const buf = await makeXlsx(rows, 'Report');
    return {
      filename: 'report.xlsx',
      mime:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buf
    };
  }

  // ===== PDF =====
  const doc = new PDFDocument({ margin: 40 });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  doc.pipe(stream);

  // Title & meta
  doc
    .fontSize(18)
    .fillColor('#25295A')
    .font('Helvetica-Bold')
    .text('Financial Report', { align: 'left' })
    .moveDown(0.3);

  doc
    .fontSize(12)
    .fillColor('#1A1A1A')
    .font('Helvetica')
    .text(`Type: ${reportTitle}`)
    .text(`Period: ${periodText}`)
    .moveDown(0.9);

  // Summary
  const summary: [string, string | number][] = [
    ['Total Transactions', totalTransactions],
    ['Total Income', totalIncome.toFixed(2)],
    ['Total Expense', totalExpense.toFixed(2)],
    ['Net', net.toFixed(2)]
  ];

  summary.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(String(value));
  });

  doc.moveDown(1.2);

  // Details table
  drawTransactionsTable(doc, doc.y, detailRows);

  doc.end();

  return await new Promise<{
    filename: string;
    mime: string;
    buf: Buffer;
  }>((resolve, reject) => {
    stream.on('data', (d: Buffer) => chunks.push(d));
    stream.on('end', () =>
      resolve({
        filename: 'report.pdf',
        mime: 'application/pdf',
        buf: Buffer.concat(chunks)
      })
    );
    stream.on('error', reject);
  });
}
