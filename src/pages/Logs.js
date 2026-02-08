import React from 'react';
import LogTable from '../components/LogTable';

export default function Logs({ logs, requestDeleteLog, setLogs }) {
  return <LogTable data={logs} title="FULL SYSTEM LOGS" onDeletePress={requestDeleteLog} setLogs={setLogs} />;
}