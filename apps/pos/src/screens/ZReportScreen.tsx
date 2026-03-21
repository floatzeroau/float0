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
import { buildZReport } from '../services/report-builder';
import type { ZReportData } from '../services/report-builder';
import type { ReportPrintData } from '../services/printer-service';
import { getPrinterService } from '../services';

type Props = NativeStackScreenProps<RootStackParamList, 'ZReport'>;

// ---------------------------------------------------------------------------
// Print formatter
// ---------------------------------------------------------------------------

function formatZReportForPrint(report: ZReportData): ReportPrintData {
  const title = 'Z REPORT';
  const lines: string[] = [];

  lines.push('='.repeat(40));
  lines.push('Z REPORT \u2014 END OF DAY');
  lines.push(`Date: ${report.date}`);
  lines.push('='.repeat(40));
  lines.push('');

  lines.push('--- Daily Summary ---');
  lines.push(`Revenue: $${report.dailyRevenue.toFixed(2)}`);
  lines.push(`Orders: ${report.dailyOrderCount}`);
  lines.push(`GST Collected: $${report.dailyGstCollected.toFixed(2)}`);
  lines.push('');

  lines.push('--- Sales by Method ---');
  lines.push(`Cash: $${report.dailySalesByMethod.cash.toFixed(2)}`);
  lines.push(`Card: $${report.dailySalesByMethod.card.toFixed(2)}`);
  lines.push(`Split: $${report.dailySalesByMethod.split.toFixed(2)}`);
  lines.push('');

  lines.push('--- Activity ---');
  lines.push(`Discounts: $${report.dailyTotalDiscounts.toFixed(2)}`);
  lines.push(`Refunds: $${report.dailyTotalRefunds.toFixed(2)}`);
  lines.push(`Tips: $${report.dailyTotalTips.toFixed(2)}`);
  lines.push('');

  if (report.shifts.length > 0) {
    lines.push('--- Shifts ---');
    for (const s of report.shifts) {
      lines.push(`${s.staffName}: $${s.totalSales.toFixed(2)} (${s.orderCount} orders)`);
    }
    lines.push('');
  }

  if (report.dailyTopProducts.length > 0) {
    lines.push('--- Top Products ---');
    for (const p of report.dailyTopProducts) {
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

export default function ZReportScreen({ navigation }: Props) {
  const [report, setReport] = useState<ZReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await buildZReport(database, new Date());
        setReport(data);
      } catch (e) {
        console.error('Failed to build Z report:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePrint = async () => {
    if (!report) return;
    const printData = formatZReportForPrint(report);
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

  // Empty state
  if (report.shifts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Z REPORT</Text>
        <Text style={styles.subtitle}>{report.date}</Text>
        <Text style={styles.emptyText}>No shifts found for today</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
      {/* Header */}
      <Text style={styles.title}>Z REPORT {'\u2014'} END OF DAY</Text>
      <Text style={styles.subtitle}>{report.date}</Text>

      {/* Daily Summary */}
      <View style={styles.card}>
        <Text style={styles.bigAmount}>${report.dailyRevenue.toFixed(2)}</Text>
        <Text style={styles.bigLabel}>Total Revenue</Text>
        <View style={styles.summaryDivider} />
        <SummaryRow label="Orders" value={String(report.dailyOrderCount)} />
        <SummaryRow label="GST Collected" value={`$${report.dailyGstCollected.toFixed(2)}`} />
      </View>

      {/* Daily Sales by Method */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sales by Method</Text>
        <SummaryRow label="Cash" value={`$${report.dailySalesByMethod.cash.toFixed(2)}`} />
        <SummaryRow label="Card" value={`$${report.dailySalesByMethod.card.toFixed(2)}`} />
        <SummaryRow label="Split" value={`$${report.dailySalesByMethod.split.toFixed(2)}`} />
      </View>

      {/* Daily Activity */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity</Text>
        <SummaryRow label="Discounts" value={`$${report.dailyTotalDiscounts.toFixed(2)}`} />
        <SummaryRow
          label="Refunds"
          value={`$${report.dailyTotalRefunds.toFixed(2)}`}
          valueColor={report.dailyTotalRefunds > 0 ? '#dc2626' : undefined}
        />
        <SummaryRow label="Tips" value={`$${report.dailyTotalTips.toFixed(2)}`} />
      </View>

      {/* Per-Shift Breakdown */}
      <Text style={styles.sectionTitle}>Shift Breakdown</Text>
      {report.shifts.map((s) => {
        const cr = s.cashReconciliation;
        const absVariance = cr.variance != null ? Math.abs(cr.variance) : 0;
        const varianceColor =
          absVariance < 1 ? '#22c55e' : absVariance <= 5 ? '#f59e0b' : '#dc2626';

        return (
          <View key={s.shiftId} style={styles.card}>
            <Text style={styles.shiftStaff}>{s.staffName}</Text>
            <SummaryRow
              label="Open"
              value={new Date(s.openedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <SummaryRow
              label="Close"
              value={new Date(s.closedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <SummaryRow label="Sales" value={`$${s.totalSales.toFixed(2)}`} />
            <SummaryRow label="Orders" value={String(s.orderCount)} />
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
        );
      })}

      {/* Daily Top Products */}
      {report.dailyTopProducts.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Products</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellName]}>Product</Text>
            <Text style={[styles.tableCell, styles.tableCellQty]}>Qty</Text>
            <Text style={[styles.tableCell, styles.tableCellRev]}>Revenue</Text>
          </View>
          {report.dailyTopProducts.map((p, i) => (
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
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 24,
    marginBottom: 4,
    alignSelf: 'flex-start',
    maxWidth: 400,
    width: '100%',
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
  shiftStaff: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
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
