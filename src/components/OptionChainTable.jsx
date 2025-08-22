import { useEffect, useState } from "react";
import { Table, Card, Spin, Alert, InputNumber, Select, Button, Tabs, Typography } from "antd";
import OIChart from "./Chart";

const { Option } = Select;
const { Title } = Typography;
const { TabPane } = Tabs;

// --- HELPER FUNCTIONS ---

function aggregateOIDataForChart(records) {
  const timestampMap = new Map();
  records.forEach(record => {
    const timestamp = record.timestamp;
    if (!timestamp) return;
    const actualTimestamp = new Date(timestamp).getTime();
    if (!timestampMap.has(actualTimestamp)) {
      timestampMap.set(actualTimestamp, {
        timestamp: actualTimestamp, ceOI: 0, peOI: 0, ceVol: 0, peVol: 0
      });
    }
    const entry = timestampMap.get(actualTimestamp);
    entry.ceOI += record.ceOpenInterest || 0;
    entry.peOI += record.peOpenInterest || 0;
    entry.ceVol += record.ceVolume || 0;
    entry.peVol += record.peVolume || 0;
  });
  return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function aggregateChangeInOIDataForChart(records) {
  const timestampMap = new Map();
  records.forEach(record => {
    const timestamp = record.timestamp;
    if (!timestamp) return;
    const actualTimestamp = new Date(timestamp).getTime();
    if (!timestampMap.has(actualTimestamp)) {
      timestampMap.set(actualTimestamp, { timestamp: actualTimestamp, ccoi: 0, pcoi: 0 });
    }
    const entry = timestampMap.get(actualTimestamp);
    entry.ccoi += record.ceChangeInOI || 0;
    entry.pcoi += record.peChangeInOI || 0;
  });
  return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function getSummaryDataForExpiry(records, expiry) {
  const filtered = records.filter((rec) => rec.expiryDate === expiry);
  const summary = {
    expiryDate: expiry, totalCEOI: 0, totalCECCOI: 0, totalCEVol: 0,
    totalPEOI: 0, totalPECCOI: 0, totalPEVol: 0, pcrOI: 0,
  };
  for (const rec of filtered) {
    summary.totalCEOI += rec.ceOpenInterest || 0;
    summary.totalCECCOI += rec.ceChangeInOI || 0;
    summary.totalCEVol += rec.ceVolume || 0;
    summary.totalPEOI += rec.peOpenInterest || 0;
    summary.totalPECCOI += rec.peChangeInOI || 0;
    summary.totalPEVol += rec.peVolume || 0;
  }
  summary.pcrOI = summary.totalCEOI === 0 ? 0 : summary.totalPEOI / summary.totalCEOI;
  return summary;
}

function formatUTCDate(isoString) {
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
// --- COLUMN DEFINITIONS ---

const columns = [
// {
//   title: "Timestamp",
//   dataIndex: "timestamp",
//   key: "timestamp",
//   width: 130,
//   align: "center",
//   render: (text) => {
//     if (!text) return "-";
//     const date = new Date(text); // UTC
//     return date.toLocaleString('en-IN', {
//       timeZone: 'Asia/Kolkata',
//       hour: '2-digit',
//       minute: '2-digit',
//       second: '2-digit',
//       year: 'numeric',
//       month: 'numeric',
//       day: 'numeric'
//     });
//   },
{
  title: "Timestamp",
  dataIndex: "timestamp",
  key: "timestamp",
  width: 130,
  align: "center",
  render: (text) => formatUTCDate(text),
  sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
},
{
  title: "Expiry Date",
  dataIndex: "expiryDate",
  key: "expiryDate",
  width: 100,
  align: "center",
  render: (text) => formatUTCDate(text),
  sorter: (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
},
  { title: "COI", dataIndex: "ceOpenInterest", key: "ceOpenInterest", render: (v) => (v !== undefined ? v.toLocaleString() : "-"), sorter: (a, b) => (a.ceOpenInterest || 0) - (b.ceOpenInterest || 0), align: "right", width: 80 },
  { title: "CCOI", dataIndex: "ceChangeInOI", key: "ceChangeInOI", render: (v) => (v !== undefined ? v.toLocaleString() : "-"), sorter: (a, b) => (a.ceChangeInOI || 0) - (b.ceChangeInOI || 0), width: 80, align: "right" },
  { title: "CCOI%", dataIndex: "cePChangeInOI", key: "cePChangeInOI", render: (v) => (v !== undefined && !isNaN(v) ? v.toFixed(2) + "%" : "-"), sorter: (a, b) => (a.cePChangeInOI || 0) - (b.cePChangeInOI || 0), width: 80, align: "right" },
  { title: "CVol", dataIndex: "ceVolume", key: "ceVolume", render: (v) => (v !== undefined ? v.toLocaleString() : "-"), sorter: (a, b) => (a.ceVolume || 0) - (b.ceVolume || 0), width: 80, align: "right" },
  { title: "CIV", dataIndex: "ceIV", key: "ceIV", render: (v) => (v !== undefined ? v.toFixed(2) : "-"), sorter: (a, b) => (a.ceIV || 0) - (b.ceIV || 0), width: 70, align: "right" },
  { title: "CE LTP", dataIndex: "ceLTP", key: "ceLTP", render: (v) => (v !== undefined ? v.toFixed(2) : "-"), sorter: (a, b) => (a.ceLTP || 0) - (b.ceLTP || 0), width: 80, align: "right" },
  { title: "Spot", dataIndex: "underlyingValue", key: "underlyingValue", render: (v) => (v ? v.toFixed(2) : "-"), sorter: (a, b) => (a.underlyingValue || 0) - (b.underlyingValue || 0), width: 80, align: "center" },
  { title: <span>Strike Price</span>, dataIndex: "strikePrice", key: "strikePrice", render: (v) => (<div className="bg-amber-200 p-0"><strong className="text-amber-600 p-0.5">{v?.toLocaleString()}</strong></div>), sorter: (a, b) => (a.strikePrice || 0) - (b.strikePrice || 0), width: 100, align: "center" },
  { title: "PE LTP", dataIndex: "peLTP", key: "peLTP", render: (v) => (v !== undefined ? v.toFixed(2) : "-"), sorter: (a, b) => (a.peLTP || 0) - (b.peLTP || 0), width: 80, align: "right" },
  { title: "PE IV", dataIndex: "peIV", key: "peIV", render: (v) => (v !== undefined ? v.toFixed(2) : "-"), sorter: (a, b) => (a.peIV || 0) - (b.peIV || 0), width: 70, align: "right" },
  { title: "PE Vol", dataIndex: "peVolume", key: "peVolume", render: (v) => (v !== undefined ? v.toLocaleString() : "-"), sorter: (a, b) => (a.peVolume || 0) - (b.peVolume || 0), width: 80, align: "right" },
  { title: "PCOI", dataIndex: "peChangeInOI", key: "peChangeInOI", render: (v) => (v !== undefined ? v.toLocaleString() : "-"), sorter: (a, b) => (a.peChangeInOI || 0) - (b.peChangeInOI || 0), width: 80, align: "right" },
  { title: "PCOI%", dataIndex: "pePChangeInOI", key: "pePChangeInOI", render: (v) => (v !== undefined && !isNaN(v) ? v.toFixed(2) + "%" : "-"), sorter: (a, b) => (a.pePChangeInOI || 0) - (b.pePChangeInOI || 0), width: 80, align: "right" },
  { title: "POI", dataIndex: "peOpenInterest", key: "peOpenInterest", render: (v) => (v !== undefined ? v.toLocaleString() : "-"), sorter: (a, b) => (a.peOpenInterest || 0) - (b.peOpenInterest || 0), width: 80, align: "right" },
  { title: "IntraDay PCR", dataIndex: "intraDayPCR", key: "intraDayPCR", render: (v) => (v !== undefined && !isNaN(v) ? v.toFixed(2) : "-"), sorter: (a, b) => (a.intraDayPCR || 0) - (b.intraDayPCR || 0), width: 100, align: "right" },
  { title: "PCR", dataIndex: "pcr", key: "pcr", render: (v) => (v !== undefined && !isNaN(v) ? v.toFixed(2) : "-"), sorter: (a, b) => (a.pcr || 0) - (b.pcr || 0), width: 80, align: "right" },
];

const summaryColumns = [
  { title: "Expiry Date", dataIndex: "expiryDate", key: "expiryDate", align: "center" },
  { title: "Call OI", dataIndex: "totalCEOI", key: "totalCEOI", render: (v) => v.toLocaleString(), align: "right" },
  { title: "Call CCOI", dataIndex: "totalCECCOI", key: "totalCECCOI", render: (v) => v.toLocaleString(), align: "right" },
  { title: "Call Volume", dataIndex: "totalCEVol", key: "totalCEVol", render: (v) => v.toLocaleString(), align: "right" },
  { title: "Put OI", dataIndex: "totalPEOI", key: "totalPEOI", render: (v) => v.toLocaleString(), align: "right" },
  { title: "Put CCOI", dataIndex: "totalPECCOI", key: "totalPECCOI", render: (v) => v.toLocaleString(), align: "right" },
  { title: "Put Volume", dataIndex: "totalPEVol", key: "totalPEVol", render: (v) => v.toLocaleString(), align: "right" },
  { title: "PCR (OI)", dataIndex: "pcrOI", key: "pcrOI", render: (v) => v.toFixed(2), align: "right" },
];

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

  useEffect(() => {
    let eventSource = null;
    let retryTimeoutId = null;
    let retryCount = 0;
    const maxRetries = 5;

    const connectSSE = () => {
      setConnectionStatus('connecting');
      setError(null);
      try {
        eventSource = new EventSource("https://nsedata-production.up.railway.app");
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
              timestamp: item.timestamp,
              underlyingValue: Number(item.underlyingValue),
              ceOpenInterest: Number(item.ceOpenInterest),
              ceChangeInOI: Number(item.ceChangeInOpenInterest),
              cePChangeInOI: (Number(item.ceOpenInterest) === 0 ? 0 : (Number(item.ceChangeInOpenInterest) / Number(item.ceOpenInterest) * 100)),
              ceVolume: Number(item.ceTotalTradedVolume),
              ceIV: Number(item.ceImpliedVolatility),
              ceLTP: Number(item.ceLastPrice),
              peOpenInterest: Number(item.peOpenInterest),
              peChangeInOI: Number(item.peChangeInOpenInterest),
              pePChangeInOI: (Number(item.peOpenInterest) === 0 ? 0 : (Number(item.peChangeInOpenInterest) / Number(item.peOpenInterest) * 100)),
              peVolume: Number(item.peTotalTradedVolume),
              peIV: Number(item.peImpliedVolatility),
              peLTP: Number(item.peLastPrice),
              intradayPCR: Number(item.intraDayPCR),
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

  return (
    <div className="w-screen h-screen overflow-auto bg-white p-4">
      <Card
        bordered={false}
        title={
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4">
            <span className="text-lg font-bold">NIFTY Option Chain</span>
            <span className="text-sm text-gray-500 mt-2 sm:mt-0">Last Updated: {formatTimestamp(meta.timestamp)}</span>
          </div>
        }
        extra={
          <div className="flex flex-col items-end gap-1 p-4">
            <span className="text-blue-700 font-semibold text-xl">Underlying Value: {meta.underlyingValue || "--"}</span>
            <span className={`text-xs px-2 py-1 rounded ${statusInfo.type === 'success' ? 'bg-green-100 text-green-800' : statusInfo.type === 'info' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>
        }
      >
        <Tabs defaultActiveKey="table" className="w-full px-4">
          <TabPane tab="Option Chain Table" key="table">
            <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-600">Strike Price:</span>
                <InputNumber size="small" placeholder="Min" value={minStrike} onChange={(value) => setMinStrike(value)} className="!w-24" />
                <span>-</span>
                <InputNumber size="small" placeholder="Max" value={maxStrike} onChange={(value) => setMaxStrike(value)} className="!w-24" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-600">Expiry Date:</span>
                <Select showSearch size="small" placeholder="Select expiry" value={selectedExpiry} onChange={(value) => setSelectedExpiry(value ?? undefined)} className="!w-48" allowClear>
                  {expiryDates.map((exp) => <Option key={exp} value={exp}>{exp}</Option>)}
                </Select>
              </div>
              <Button size="small" onClick={() => { setMinStrike(null); setMaxStrike(null); setSelectedExpiry(undefined); }}>Reset Filters</Button>
            </div>
            {summaryData.length > 0 && (
              <>
                <Title level={5}>Expiry Summary</Title>
                <Table pagination={false} columns={summaryColumns} dataSource={summaryData} size="small" bordered rowKey="expiryDate" className="mb-6" />
              </>
            )}
            <Alert message={statusInfo.message} type={statusInfo.type} className="mb-4" />
            {loading ? <div className="flex justify-center items-center min-h-[200px]"><Spin size="large" /></div>
              : !isDataReceived ? <div className="flex justify-center items-center min-h-[200px]"><Alert message="No data received yet" description="Please ensure the server is running and streaming data." type="warning" showIcon /></div>
                : <Table pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '200', '500'] }} columns={columns} dataSource={records} size="small" scroll={{ x: "max-content" }} bordered sticky />
            }
          </TabPane>
          <TabPane tab="OI Charts" key="charts">
            <div className="mb-4">
              <Title level={5}>Open Interest Trend {selectedExpiry && <span className="text-sm text-gray-500 ml-2">({selectedExpiry})</span>}</Title>
              <p className="text-sm text-gray-600 mb-4">Displaying aggregated Call and Put Open Interest over time{selectedExpiry ? ` for expiry ${selectedExpiry}` : ' for all expiries'}. Data points: {historicalData.length}</p>
              <div style={{ height: 400 }}>
                <OIChart data={historicalData} callLineName="Call OI" putLineName="Put OI" />
              </div>
            </div>
            <div className="mt-8 mb-4">
              <Title level={5}>Change in OI (CCOI vs PCOI) Trend {selectedExpiry && <span className="text-sm text-gray-500 ml-2">({selectedExpiry})</span>}</Title>
              <p className="text-sm text-gray-600 mb-4">Displaying aggregated Call and Put Change in OI over time{selectedExpiry ? ` for expiry ${selectedExpiry}` : ' for all expiries'}. Data points: {changeInData.length}</p>
              <div style={{ height: 400 }}>
                <OIChart data={changeInData.map(d => ({ timestamp: d.timestamp, ceOI: d.ccoi, peOI: d.pcoi }))} callLineName="Call Change in OI (CCOI)" putLineName="Put Change in OI (PCOI)" />
              </div>
            </div>
            <div className="mt-8 mb-4">
              <Title level={5}>Volume Trend {selectedExpiry && <span className="text-sm text-gray-500 ml-2">({selectedExpiry})</span>}</Title>
              <p className="text-sm text-gray-600 mb-4">Displaying aggregated Call and Put Volumes over time{selectedExpiry ? ` for expiry ${selectedExpiry}` : ' for all expiries'}. Data points: {historicalData.length}</p>
              <div style={{ height: 400 }}>
                <OIChart data={historicalData.map(d => ({ timestamp: d.timestamp, ceOI: d.ceVol, peOI: d.peVol }))} callLineName="Call Volume" putLineName="Put Volume" />
              </div>
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
}

export default OptionChainTable;