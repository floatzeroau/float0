import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { database } from '../db/database';
import type { Shift } from '../db/models';
import { buildShiftReport } from '../services/report-builder';
import type { ShiftReportData } from '../services/report-builder';
import type { ReportPrintData } from '../services/printer-service';
import { getPrinterService } from '../services';

type Props = NativeStackScreenProps<RootStackParamList, 'ShiftReport'>;

// ---------------------------------------------------------------------------
// Print formatter
// ---------------------------------------------------------------------------

function formatReportForPrint(report: ShiftReportData, reportType: 'X' | 'shift'): ReportPrintData {
  const title = reportType === 'X' ? 'X REPORT' : 'SHIFT REPORT';
  const lines: string[] = [];

  lines.push('='.repeat(40));
  lines.push(title);
  if (reportType === 'X') lines.push('** NON-RESETTING **');
  lines.push('='.repeat(40));
  lines.push('');

  lines.push(`Staff: ${report.staffName}`);
  lines.push(`Opened: ${new Date(report.openedAt).toLocaleString()}`);
  if (report.closedAt) lines.push(`Closed: ${new Date(report.closedAt).toLocaleString()}`);
  lines.push(`Duration: ${report.shiftDuration}`);
  lines.push('');

  lines.push('--- Summary ---');
  lines.push(`Total Sales: $${report.totalSales.toFixed(2)}`);
  lines.push(`Orders: ${report.orderCount}`);
  lines.push(`Avg Order: $${report.averageOrderValue.toFixed(2)}`);
  lines.push('');

  lines.push('--- Sales by Method ---');
  lines.push(`Cash: $${report.salesByMethod.cash.toFixed(2)}`);
  lines.push(`Card: $${report.salesByMethod.card.toFixed(2)}`);
  lines.push(`Split: $${report.salesByMethod.split.toFixed(2)}`);
  lines.push('');

  lines.push('--- Cash Reconciliation ---');
  const cr = report.cashReconciliation;
  lines.push(`Opening Float: $${cr.openingFloat.toFixed(2)}`);
  lines.push(`Cash Sales: $${cr.cashSales.toFixed(2)}`);
  lines.push(`Cash Refunds: -$${cr.cashRefunds.toFixed(2)}`);
  lines.push(`Cash In: $${cr.cashIn.toFixed(2)}`);
  lines.push(`Cash Out: -$${cr.cashOut.toFixed(2)}`);
  lines.push('-'.repeat(30));
  lines.push(`Expected Cash: $${cr.expectedCash.toFixed(2)}`);
  if (cr.actualCash != null) lines.push(`Actual Cash: $${cr.actualCash.toFixed(2)}`);
  if (cr.variance != null)
    lines.push(`Variance: ${cr.variance >= 0 ? '+' : ''}$${cr.variance.toFixed(2)}`);
  lines.push('');

  lines.push('--- Activity ---');
  lines.push(`Discounts: $${report.totalDiscounts.toFixed(2)}`);
  lines.push(`Voids: $${report.totalVoids.toFixed(2)}`);
  lines.push(`Refunds: $${report.totalRefunds.toFixed(2)}`);
  lines.push(`Tips: $${report.totalTips.toFixed(2)}`);
  lines.push(`GST: $${report.totalGst.toFixed(2)}`);
  lines.push(`Drawer Opens: ${report.drawerOpens}`);
  lines.push('');

  if (report.topProducts.length > 0) {
    lines.push('--- Top Products ---');
    for (const p of report.topProducts) {
      lines.push(`${p.name}  x${p.quantity}  $${p.revenue.toFixed(2)}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(40));
  return { title, lines };
}

// ---------------------------------------------------------------------------
// Summary Row
// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ShiftReportScreen({ route, navigation }: Props) {
  const { shiftId, reportType } = route.params;
  const [report, setReport] = useState<ShiftReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const shift = await database.get<Shift>('shifts').find(shiftId);
        const data = await buildShiftReport(database, shift);
        setReport(data);
      } catch (e) {
        console.error('Failed to build shift report:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [shiftId]);

  const handlePrint = async () => {
    if (!report) return;
    const printData = formatReportForPrint(report, reportType);
    await getPrinterService().printReport(printData);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load report</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isXReport = reportType === 'X';
  const cr = report.cashReconciliation;
  const absVariance = cr.variance != null ? Math.abs(cr.variance) : 0;
  const varianceColor = absVariance < 1 ? '#22c55e' : absVariance <= 5 ? '#f59e0b' : '#dc2626';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
      {/* Header */}
      <Text style={styles.title}>{isXReport ? 'X REPORT' : 'SHIFT REPORT'}</Text>
      {isXReport && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>NON-RESETTING</Text>
        </View>
      )}

      {/* Summary */}
      <View style={styles.card}>
        <SummaryRow label="Staff" value={report.staffName} />
        <SummaryRow label="Duration" value={report.shiftDuration} />
        <View style={styles.summaryDivider} />
        <Text style={styles.bigAmount}>${report.totalSales.toFixed(2)}</Text>
        <Text style={styles.bigLabel}>Total Sales</Text>
        <View style={styles.summaryDivider} />
        <SummaryRow label="Orders" value={String(report.orderCount)} />
        <SummaryRow label="Avg Order" value={`$${report.averageOrderValue.toFixed(2)}`} />
      </View>

      {/* Sales by Method */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sales by Method</Text>
        <SummaryRow label="Cash" value={`$${report.salesByMethod.cash.toFixed(2)}`} />
        <SummaryRow label="Card" value={`$${report.salesByMethod.card.toFixed(2)}`} />
        <SummaryRow label="Split" value={`$${report.salesByMethod.split.toFixed(2)}`} />
      </View>

      {/* Cash Reconciliation */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cash Reconciliation</Text>
        <SummaryRow label="Opening Float" value={`$${cr.openingFloat.toFixed(2)}`} />
        <SummaryRow label="Cash Sales" value={`$${cr.cashSales.toFixed(2)}`} />
        <SummaryRow label="Cash Refunds" value={`-$${cr.cashRefunds.toFixed(2)}`} />
        <SummaryRow label="Cash In" value={`$${cr.cashIn.toFixed(2)}`} />
        <SummaryRow label="Cash Out" value={`-$${cr.cashOut.toFixed(2)}`} />
        <View style={styles.summaryDivider} />
        <SummaryRow label="Expected Cash" value={`$${cr.expectedCash.toFixed(2)}`} />
        {cr.actualCash != null && (
          <SummaryRow label="Actual Cash" value={`$${cr.actualCash.toFixed(2)}`} />
        )}
        {cr.variance != null && (
          <SummaryRow
            label="Variance"
            value={`${cr.variance >= 0 ? '+' : ''}$${cr.variance.toFixed(2)}`}
            valueColor={varianceColor}
          />
        )}
      </View>

      {/* Activity */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity</Text>
        <SummaryRow label="Discounts" value={`$${report.totalDiscounts.toFixed(2)}`} />
        <SummaryRow
          label="Voids"
          value={`$${report.totalVoids.toFixed(2)}`}
          valueColor={report.totalVoids > 0 ? '#dc2626' : undefined}
        />
        <SummaryRow
          label="Refunds"
          value={`$${report.totalRefunds.toFixed(2)}`}
          valueColor={report.totalRefunds > 0 ? '#dc2626' : undefined}
        />
        <SummaryRow label="Tips" value={`$${report.totalTips.toFixed(2)}`} />
        <SummaryRow label="GST Collected" value={`$${report.totalGst.toFixed(2)}`} />
        <SummaryRow label="Drawer Opens" value={String(report.drawerOpens)} />
      </View>

      {/* Top Products */}
      {report.topProducts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Products</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellName]}>Product</Text>
            <Text style={[styles.tableCell, styles.tableCellQty]}>Qty</Text>
            <Text style={[styles.tableCell, styles.tableCellRev]}>Revenue</Text>
          </View>
          {report.topProducts.map((p, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.tableCellName]} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellQty]}>{p.quantity}</Text>
              <Text style={[styles.tableCell, styles.tableCellRev]}>${p.revenue.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
        <Text style={styles.printButtonText}>Print Report</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  banner: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },

  // Cards
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Summary rows
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },

  // Big amount
  bigAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 4,
  },
  bigLabel: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 4,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  tableCell: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  tableCellName: {
    flex: 1,
  },
  tableCellQty: {
    width: 50,
    textAlign: 'center',
  },
  tableCellRev: {
    width: 80,
    textAlign: 'right',
    fontWeight: '600',
  },

  // Buttons
  printButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  printButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
});
