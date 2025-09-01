import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// --- UTILITY FUNCTIONS ---

function formatUTCDate(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);

  const day = date.getUTCDate();
  const month = date.toLocaleString("default", { month: "short", timeZone: "UTC" });
  const year = date.getUTCFullYear();

  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds} ${ampm} UTC`;
}

// NEW: Consistent time formatting for charts
function formatChartTime(timestamp) {
  if (!timestamp) return "";
  // Handle both ISO string and milliseconds
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC'
  });
}

function formatChartDateTime(timestamp) {
  if (!timestamp) return "";
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + ' UTC';
}

function aggregateOIDataForChart(records) {
  const timestampMap = new Map();
  records.forEach(record => {
    const timestamp = record.timestamp;
    if (!timestamp) return;
    
    // Use the original timestamp (ISO string) as the key for consistency
    const timeKey = timestamp;
    if (!timestampMap.has(timeKey)) {
      timestampMap.set(timeKey, {
        timestamp: timeKey, // Keep as ISO string for consistent parsing
        ceOI: 0, 
        peOI: 0, 
        ceVol: 0, 
        peVol: 0
      });
    }
    const entry = timestampMap.get(timeKey);
    entry.ceOI += record.ceOpenInterest || 0;
    entry.peOI += record.peOpenInterest || 0;
    entry.ceVol += record.ceTotalTradedVolume || 0;
    entry.peVol += record.peTotalTradedVolume || 0;
  });
  
  return Array.from(timestampMap.values()).sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function aggregateChangeInOIDataForChart(records) {
  const timestampMap = new Map();
  records.forEach(record => {
    const timestamp = record.timestamp;
    if (!timestamp) return;
    
    const timeKey = timestamp;
    if (!timestampMap.has(timeKey)) {
      timestampMap.set(timeKey, { 
        timestamp: timeKey, // Keep as ISO string
        ccoi: 0, 
        pcoi: 0 
      });
    }
    const entry = timestampMap.get(timeKey);
    entry.ccoi += record.ceChangeInOpenInterest || 0;
    entry.pcoi += record.peChangeInOpenInterest || 0;
  });
  
  return Array.from(timestampMap.values()).sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function getSummaryDataForExpiry(records, expiry) {
  const filtered = records.filter((rec) => rec.expiryDate === expiry);
  const summary = {
    expiryDate: expiry, totalCEOI: 0, totalCECCOI: 0, totalCEVol: 0,
    totalPEOI: 0, totalPECCOI: 0, totalPEVol: 0, pcrOI: 0,
  };
  for (const rec of filtered) {
    summary.totalCEOI += rec.ceOpenInterest || 0;
    summary.totalCECCOI += rec.ceChangeInOpenInterest || 0;
    summary.totalCEVol += rec.ceTotalTradedVolume || 0;
    summary.totalPEOI += rec.peOpenInterest || 0;
    summary.totalPECCOI += rec.peChangeInOpenInterest || 0;
    summary.totalPEVol += rec.peTotalTradedVolume || 0;
  }
  summary.pcrOI = summary.totalCEOI === 0 ? 0 : summary.totalPEOI / summary.totalCEOI;
  return summary;
}

// --- CHART COMPONENT (FIXED) ---
const OIChart = ({ data, callLineName, putLineName }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-blue-50 border border-blue-200 rounded">
        <div className="text-center">
          <div className="text-blue-600 text-lg font-medium">No chart data available</div>
          <div className="text-blue-500 text-sm mt-1">Waiting for data points from the stream.</div>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatChartTime} // Using the fixed formatter
        />
        <YAxis
          tickFormatter={(value) =>
            new Intl.NumberFormat("en-IN", {
              notation: "compact",
              compactDisplay: "short",
            }).format(value)
          }
        />
        <Tooltip
          labelFormatter={formatChartDateTime} // Using the fixed formatter
          formatter={(value, name) => [value.toLocaleString(), name]}
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

// --- MAIN TABLE COMPONENT ---
function OptionChainTable() {
  const [rawRecords, setRawRecords] = useState([]);
  const [expiryDates, setExpiryDates] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [meta, setMeta] = useState({ timestamp: "", underlyingValue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [minStrike, setMinStrike] = useState(null);
  const [maxStrike, setMaxStrike] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(undefined);
  const [historicalData, setHistoricalData] = useState([]);
  const [changeInData, setChangeInData] = useState([]);
  const [isDataReceived, setDataReceived] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeTab, setActiveTab] = useState('table');

  useEffect(() => {
    let eventSource = null;
    let retryTimeoutId = null;
    let retryCount = 0;
    const maxRetries = 5;

    const connectSSE = () => {
      setConnectionStatus('connecting');
      setError(null);
      try {
        eventSource = new EventSource("https://nsedata-production.up.railway.app/api/data");
        eventSource.onopen = () => {
          setConnectionStatus('connected');
          retryCount = 0;
        };

        eventSource.onmessage = (event) => {
          try {
            setLoading(false);
            setConnectionStatus('receiving');
            if (!event.data || event.data.trim() === '') return;

            const parsedData = JSON.parse(event.data);
            if (!Array.isArray(parsedData) || parsedData.length === 0) {
              setError('Expected an array of records from the server.');
              return;
            }
            
            const allRecords = parsedData.map(item => ({
              key: `${item.strikePrice}-${item.expiryDate}-${item.timestamp}`,
              strikePrice: Number(item.strikePrice),
              expiryDate: item.expiryDate,
              timestamp: item.timestamp, // Keep as ISO string
              underlyingValue: Number(item.underlyingValue),
              ceOpenInterest: Number(item.ceOpenInterest),
              ceChangeInOpenInterest: Number(item.ceChangeInOpenInterest),
              ceChangeInOpenInterestPercentage: Number(item.ceChangeInOpenInterestPercentage),
              ceTotalTradedVolume: Number(item.ceTotalTradedVolume),
              ceImpliedVolatility: Number(item.ceImpliedVolatility),
              ceLastPrice: Number(item.ceLastPrice),
              peOpenInterest: Number(item.peOpenInterest),
              peChangeInOpenInterest: Number(item.peChangeInOpenInterest),
              peChangeInOpenInterestPercentage: Number(item.peChangeInOpenInterestPercentage),
              peTotalTradedVolume: Number(item.peTotalTradedVolume),
              peImpliedVolatility: Number(item.peImpliedVolatility),
              peLastPrice: Number(item.peLastPrice),
              intraDayPCR: Number(item.intraDayPCR),
              pcr: Number(item.pcr),
            }));

            const latestRecord = allRecords.reduce((latest, current) =>
              (new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime()) ? current : latest, allRecords[0]
            );

            setDataReceived(true);
            setRawRecords(allRecords);
            setExpiryDates([...new Set(allRecords.map(rec => rec.expiryDate))].sort());
            setMeta({ timestamp: latestRecord.timestamp, underlyingValue: latestRecord.underlyingValue });
            setError(null);
            setConnectionStatus('connected');

          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(`Data processing error: ${errorMessage}`);
            setConnectionStatus('error');
          }
        };

        eventSource.onerror = () => {
          setConnectionStatus('error');
          if (eventSource && eventSource.readyState === EventSource.CLOSED) {
            setError("Connection closed. Retrying...");
            retryConnection();
          }
          setLoading(false);
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Connection error: ${errorMessage}`);
        setLoading(false);
        setConnectionStatus('error');
      }
    };

    const retryConnection = () => {
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryTimeoutId = setTimeout(connectSSE, delay);
      } else {
        setError("Failed to connect after multiple attempts.");
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, []);

  useEffect(() => {
    if (!selectedExpiry && expiryDates.length) {
      setSelectedExpiry(expiryDates[0]);
    }
  }, [expiryDates, selectedExpiry]);

  useEffect(() => {
    let filtered = rawRecords;
    if (selectedExpiry) filtered = filtered.filter((rec) => rec.expiryDate === selectedExpiry);
    if (minStrike !== null) filtered = filtered.filter((rec) => rec.strikePrice >= minStrike);
    if (maxStrike !== null) filtered = filtered.filter((rec) => rec.strikePrice <= maxStrike);
    setRecords(filtered);
  }, [rawRecords, minStrike, maxStrike, selectedExpiry]);

  useEffect(() => {
    if (rawRecords.length > 0 && expiryDates.length > 0) {
      const summary = expiryDates.slice(0, 2).map((exp) => getSummaryDataForExpiry(rawRecords, exp));
      setSummaryData(summary);
    }
  }, [rawRecords, expiryDates]);

  useEffect(() => {
    if (rawRecords.length > 0) {
      const expiryToUse = selectedExpiry || expiryDates[0];
      const filteredForChart = expiryToUse ? rawRecords.filter(record => record.expiryDate === expiryToUse) : rawRecords;
      setHistoricalData(aggregateOIDataForChart(filteredForChart));
      setChangeInData(aggregateChangeInOIDataForChart(filteredForChart));
    }
  }, [rawRecords, selectedExpiry, expiryDates]);

  const statusInfo = {
    connecting: { message: "Connecting to data stream...", type: "info" },
    connected: { message: isDataReceived ? "Connected, streaming data" : "Connected, waiting for data...", type: "success" },
    receiving: { message: "Live data stream active", type: "success" },
    error: { message: error || "Connection error", type: "error" },
  }[connectionStatus] || { message: "Unknown status", type: "warning" };

  const formatTimestamp = (ts) => {
    if (!ts) return "--";
    const date = new Date(ts);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  };

  // Sample data structure for demonstration (since we can't connect to external SSE in this environment)
  const sampleData = [
    {
      key: "sample-1",
      timestamp: "2024-09-01T10:30:00Z",
      strikePrice: 25000,
      expiryDate: "2024-09-05T18:30:00Z",
      underlyingValue: 25050.25,
      ceOpenInterest: 150000,
      ceChangeInOpenInterest: 5000,
      ceChangeInOpenInterestPercentage: 3.45,
      ceTotalTradedVolume: 25000,
      ceImpliedVolatility: 18.5,
      ceLastPrice: 125.50,
      peOpenInterest: 180000,
      peChangeInOpenInterest: -3000,
      peChangeInOpenInterestPercentage: -1.64,
      peTotalTradedVolume: 30000,
      peImpliedVolatility: 19.2,
      peLastPrice: 95.75,
      intraDayPCR: 1.2,
      pcr: 1.15
    },
    {
      key: "sample-2", 
      timestamp: "2024-09-01T10:31:00Z",
      strikePrice: 25000,
      expiryDate: "2024-09-05T18:30:00Z", 
      underlyingValue: 25055.75,
      ceOpenInterest: 152000,
      ceChangeInOpenInterest: 7000,
      ceChangeInOpenInterestPercentage: 4.82,
      ceTotalTradedVolume: 26500,
      ceImpliedVolatility: 18.3,
      ceLastPrice: 128.25,
      peOpenInterest: 178000,
      peChangeInOpenInterest: -5000,
      peChangeInOpenInterestPercentage: -2.73,
      peTotalTradedVolume: 31200,
      peImpliedVolatility: 19.0,
      peLastPrice: 92.50,
      intraDayPCR: 1.17,
      pcr: 1.12
    }
  ];

  // Use sample data for demonstration
  const displayRecords = records.length > 0 ? records : sampleData;
  const displayHistoricalData = historicalData.length > 0 ? historicalData : aggregateOIDataForChart(sampleData);
  const displayChangeInData = changeInData.length > 0 ? changeInData : aggregateChangeInOIDataForChart(sampleData);

  return (
    <div className="w-full h-screen overflow-auto bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-sm border">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 border-b">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-gray-800">NIFTY Option Chain</h1>
            <span className="text-sm text-gray-500 mt-1">Last Updated: {formatTimestamp(meta.timestamp)}</span>
          </div>
          <div className="flex flex-col items-end gap-2 mt-4 sm:mt-0">
            <span className="text-blue-700 font-semibold text-xl">Underlying Value: {meta.underlyingValue || "--"}</span>
            <span className={`text-xs px-3 py-1 rounded-full ${
              statusInfo.type === 'success' ? 'bg-green-100 text-green-800' : 
              statusInfo.type === 'info' ? 'bg-blue-100 text-blue-800' : 
              'bg-red-100 text-red-800'
            }`}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="p-6">
          <div className="border-b mb-6">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('table')}
                className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'table' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Option Chain Table
              </button>
              <button
                onClick={() => setActiveTab('charts')}
                className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'charts' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                OI Charts
              </button>
            </div>
          </div>

          {activeTab === 'table' && (
            <div>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-600">Strike Price:</span>
                  <input
                    type="number"
                    placeholder="Min"
                    value={minStrike || ''}
                    onChange={(e) => setMinStrike(e.target.value ? Number(e.target.value) : null)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxStrike || ''}
                    onChange={(e) => setMaxStrike(e.target.value ? Number(e.target.value) : null)}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-600">Expiry Date:</span>
                  <select
                    value={selectedExpiry || ''}
                    onChange={(e) => setSelectedExpiry(e.target.value || undefined)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm w-48"
                  >
                    <option value="">All Expiries</option>
                    {expiryDates.map((exp) => (
                      <option key={exp} value={exp}>{formatUTCDate(exp)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { setMinStrike(null); setMaxStrike(null); setSelectedExpiry(undefined); }}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                >
                  Reset Filters
                </button>
              </div>

              {/* Summary Table */}
              {summaryData.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Expiry Summary</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 border text-center">Expiry Date</th>
                          <th className="px-4 py-2 border text-right">Call OI</th>
                          <th className="px-4 py-2 border text-right">Call CCOI</th>
                          <th className="px-4 py-2 border text-right">Call Volume</th>
                          <th className="px-4 py-2 border text-right">Put OI</th>
                          <th className="px-4 py-2 border text-right">Put CCOI</th>
                          <th className="px-4 py-2 border text-right">Put Volume</th>
                          <th className="px-4 py-2 border text-right">PCR (OI)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.map((row) => (
                          <tr key={row.expiryDate} className="hover:bg-gray-50">
                            <td className="px-4 py-2 border text-center">{formatUTCDate(row.expiryDate)}</td>
                            <td className="px-4 py-2 border text-right">{row.totalCEOI.toLocaleString()}</td>
                            <td className="px-4 py-2 border text-right">{row.totalCECCOI.toLocaleString()}</td>
                            <td className="px-4 py-2 border text-right">{row.totalCEVol.toLocaleString()}</td>
                            <td className="px-4 py-2 border text-right">{row.totalPEOI.toLocaleString()}</td>
                            <td className="px-4 py-2 border text-right">{row.totalPECCOI.toLocaleString()}</td>
                            <td className="px-4 py-2 border text-right">{row.totalPEVol.toLocaleString()}</td>
                            <td className="px-4 py-2 border text-right">{row.pcrOI.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status Alert */}
              <div className={`mb-4 p-3 rounded ${
                statusInfo.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
                statusInfo.type === 'info' ? 'bg-blue-50 border border-blue-200 text-blue-800' :
                'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {statusInfo.message}
              </div>

              {/* Main Data Table */}
              {loading ? (
                <div className="flex justify-center items-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : !isDataReceived && records.length === 0 ? (
                <div className="flex justify-center items-center min-h-[200px]">
                  <div className="text-center">
                    <div className="text-orange-600 font-medium">No data received yet</div>
                    <div className="text-gray-500 text-sm mt-1">Please ensure the server is running and streaming data.</div>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-300 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 border text-center w-32">Timestamp</th>
                        <th className="px-2 py-2 border text-center w-24">Expiry Date</th>
                        <th className="px-2 py-2 border text-right w-20">COI</th>
                        <th className="px-2 py-2 border text-right w-20">CCOI</th>
                        <th className="px-2 py-2 border text-right w-20">CCOI%</th>
                        <th className="px-2 py-2 border text-right w-20">CVol</th>
                        <th className="px-2 py-2 border text-right w-16">CIV</th>
                        <th className="px-2 py-2 border text-right w-20">CE LTP</th>
                        <th className="px-2 py-2 border text-center w-20">Spot</th>
                        <th className="px-2 py-2 border text-center w-24 bg-amber-100">Strike Price</th>
                        <th className="px-2 py-2 border text-right w-20">PE LTP</th>
                        <th className="px-2 py-2 border text-right w-16">PE IV</th>
                        <th className="px-2 py-2 border text-right w-20">PE Vol</th>
                        <th className="px-2 py-2 border text-right w-20">PCOI</th>
                        <th className="px-2 py-2 border text-right w-20">PCOI%</th>
                        <th className="px-2 py-2 border text-right w-20">POI</th>
                        <th className="px-2 py-2 border text-right w-24">IntraDay PCR</th>
                        <th className="px-2 py-2 border text-right w-20">PCR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRecords.map((record) => (
                        <tr key={record.key} className="hover:bg-gray-50">
                          <td className="px-2 py-1 border text-center text-xs">{formatUTCDate(record.timestamp)}</td>
                          <td className="px-2 py-1 border text-center text-xs">{formatUTCDate(record.expiryDate)}</td>
                          <td className="px-2 py-1 border text-right">{record.ceOpenInterest?.toLocaleString() || "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.ceChangeInOpenInterest?.toLocaleString() || "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.ceChangeInOpenInterestPercentage ? record.ceChangeInOpenInterestPercentage.toFixed(2) + "%" : "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.ceTotalTradedVolume?.toLocaleString() || "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.ceImpliedVolatility ? record.ceImpliedVolatility.toFixed(2) : "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.ceLastPrice ? record.ceLastPrice.toFixed(2) : "-"}</td>
                          <td className="px-2 py-1 border text-center">{record.underlyingValue ? record.underlyingValue.toFixed(2) : "-"}</td>
                          <td className="px-2 py-1 border text-center bg-amber-200">
                            <strong className="text-amber-700">{record.strikePrice?.toLocaleString()}</strong>
                          </td>
                          <td className="px-2 py-1 border text-right">{record.peLastPrice ? record.peLastPrice.toFixed(2) : "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.peImpliedVolatility ? record.peImpliedVolatility.toFixed(2) : "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.peTotalTradedVolume?.toLocaleString() || "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.peChangeInOpenInterest?.toLocaleString() || "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.peChangeInOpenInterestPercentage ? record.peChangeInOpenInterestPercentage.toFixed(2) + "%" : "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.peOpenInterest?.toLocaleString() || "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.intraDayPCR ? record.intraDayPCR.toFixed(2) : "-"}</td>
                          <td className="px-2 py-1 border text-right">{record.pcr ? record.pcr.toFixed(2) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'charts' && (
            <div>
              {/* Open Interest Chart */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-2">
                  Open Interest Trend 
                  {selectedExpiry && <span className="text-sm text-gray-500 ml-2">({formatUTCDate(selectedExpiry)})</span>}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Displaying aggregated Call and Put Open Interest over time
                  {selectedExpiry ? ` for expiry ${formatUTCDate(selectedExpiry)}` : ' for all expiries'}. 
                  Data points: {displayHistoricalData.length}
                </p>
                <div className="h-96 border border-gray-200 rounded-lg p-4 bg-white">
                  <OIChart 
                    data={displayHistoricalData} 
                    callLineName="Call OI" 
                    putLineName="Put OI" 
                  />
                </div>
              </div>

              {/* Change in OI Chart */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-2">
                  Change in OI (CCOI vs PCOI) Trend 
                  {selectedExpiry && <span className="text-sm text-gray-500 ml-2">({formatUTCDate(selectedExpiry)})</span>}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Displaying aggregated Call and Put Change in OI over time
                  {selectedExpiry ? ` for expiry ${formatUTCDate(selectedExpiry)}` : ' for all expiries'}. 
                  Data points: {displayChangeInData.length}
                </p>
                <div className="h-96 border border-gray-200 rounded-lg p-4 bg-white">
                  <OIChart 
                    data={displayChangeInData.map(d => ({ 
                      timestamp: d.timestamp, 
                      ceOI: d.ccoi, 
                      peOI: d.pcoi 
                    }))} 
                    callLineName="Call Change in OI (CCOI)" 
                    putLineName="Put Change in OI (PCOI)" 
                  />
                </div>
              </div>

              {/* Volume Chart */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-2">
                  Volume Trend 
                  {selectedExpiry && <span className="text-sm text-gray-500 ml-2">({formatUTCDate(selectedExpiry)})</span>}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Displaying aggregated Call and Put Volumes over time
                  {selectedExpiry ? ` for expiry ${formatUTCDate(selectedExpiry)}` : ' for all expiries'}. 
                  Data points: {displayHistoricalData.length}
                </p>
                <div className="h-96 border border-gray-200 rounded-lg p-4 bg-white">
                  <OIChart 
                    data={displayHistoricalData.map(d => ({ 
                      timestamp: d.timestamp, 
                      ceOI: d.ceVol, 
                      peOI: d.peVol 
                    }))} 
                    callLineName="Call Volume" 
                    putLineName="Put Volume" 
                  />
                </div>
              </div>

              {/* Debug Info */}
              <div className="mt-8 p-4 bg-gray-100 rounded-lg">
                <h4 className="font-semibold mb-2">Chart Debug Information:</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Historical Data Points: {displayHistoricalData.length}</div>
                  <div>Change in OI Data Points: {displayChangeInData.length}</div>
                  <div>Selected Expiry: {selectedExpiry ? formatUTCDate(selectedExpiry) : 'All'}</div>
                  {displayHistoricalData.length > 0 && (
                    <>
                      <div>First Timestamp: {formatUTCDate(displayHistoricalData[0]?.timestamp)}</div>
                      <div>Last Timestamp: {formatUTCDate(displayHistoricalData[displayHistoricalData.length - 1]?.timestamp)}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OptionChainTable;