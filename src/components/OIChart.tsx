import React from "react";
import { Alert } from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// --- TYPE DEFINITIONS for OIChart ---

// Props for the OIChart component
interface OIChartProps {
  data: { timestamp: number; ceOI: number; peOI: number }[];
  callLineName: string;
  putLineName: string;
}

// --- OI CHART COMPONENT ---

const OIChart: React.FC<OIChartProps> = ({ data, callLineName, putLineName }) => {
  if (!data || data.length === 0) {
    return (
      <Alert
        message="No chart data available"
        description="Waiting for data points from the stream."
        type="info"
        showIcon
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t: number) => new Date(t).toLocaleTimeString()}
        />
        <YAxis
          tickFormatter={(value: number) =>
            new Intl.NumberFormat("en-IN", {
              notation: "compact",
              compactDisplay: "short",
            }).format(value)
          }
        />
        <Tooltip
          labelFormatter={(t: number) => new Date(t).toLocaleString()}
          formatter={(value: number, name: string) => [value.toLocaleString(), name]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="ceOI"
          stroke="#ff5252"
          name={callLineName}
          dot={false}
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="peOI"
          stroke="#4caf50"
          name={putLineName}
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
export default OIChart;