import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Alert } from 'antd';

const OIChart = ({ data, callLineName, putLineName }) => {
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

  // Calculate dynamic Y-axis domain for better sensitivity
  const calculateYDomain = (data) => {
    const allValues = data.flatMap(d => [d.ceOI || 0, d.peOI || 0]).filter(v => v > 0);
    
    if (allValues.length === 0) return [0, 100];
    
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    
    // If min and max are the same, create a small range
    if (minVal === maxVal) {
      const baseValue = minVal || 1;
      return [
        Math.max(0, baseValue * 0.9),
        baseValue * 1.1
      ];
    }
    
    const range = maxVal - minVal;
    
    // Use smaller padding for more sensitive scaling
    const padding = range * 0.02; // Reduced from typical 5-10% to 2%
    
    // Calculate bounds with minimal padding
    const lowerBound = Math.max(0, minVal - padding);
    const upperBound = maxVal + padding;
    
    return [lowerBound, upperBound];
  };

  const yDomain = calculateYDomain(data);

  // Enhanced tick count for more granular Y-axis
  const getTickCount = (domain) => {
    const range = domain[1] - domain[0];
    if (range === 0) return 5;
    
    // More ticks for smaller ranges to show finer details
    if (range < 1000) return 10;
    if (range < 10000) return 12;
    if (range < 100000) return 15;
    return 20;
  };

  const tickCount = getTickCount(yDomain);

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={700}>
      <LineChart data={data} margin={{ top: 30, right: 50, left: 80, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => {
            const date = new Date(t);
            return date.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'UTC'
            });
          }}
          stroke="#666"
          fontSize={12}
        />
        <YAxis
          domain={yDomain}
          tickCount={tickCount}
          tickFormatter={(value) => {
            // More precise formatting for better readability
            if (value >= 10000000) {
              return `${(value / 10000000).toFixed(1)}Cr`;
            } else if (value >= 100000) {
              return `${(value / 100000).toFixed(1)}L`;
            } else if (value >= 1000) {
              return `${(value / 1000).toFixed(1)}K`;
            } else {
              return value.toFixed(0);
            }
          }}
          stroke="#666"
          fontSize={12}
          width={60}
        />
        <Tooltip
          labelFormatter={(t) => {
            const date = new Date(t);
            return date.toLocaleString('en-US', {
              timeZone: 'UTC',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }) + ' UTC';
          }}
          formatter={(value, name) => [
            new Intl.NumberFormat("en-IN").format(value),
            name
          ]}
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '12px'
          }}
        />
        <Legend 
          wrapperStyle={{ fontSize: '12px' }}
        />
        <Line
          type="monotone"
          dataKey="ceOI"
          stroke="#ff5252"
          name={callLineName}
          dot={false}
          strokeWidth={2.5}
          activeDot={{ r: 4, fill: '#ff5252' }}
        />
        <Line
          type="monotone"
          dataKey="peOI"
          stroke="#4caf50"
          name={putLineName}
          dot={false}
          strokeWidth={2.5}
          activeDot={{ r: 4, fill: '#4caf50' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default OIChart;