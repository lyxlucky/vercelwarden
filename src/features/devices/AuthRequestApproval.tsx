"use client";

import { useState } from "react";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LocationOnOutlined from "@mui/icons-material/LocationOnOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, Stack, Typography } from "@mui/material";
import { approveAuthRequest, respondToAuthRequest, type AuthRequestSummary } from "@/features/devices/api";

function RequestSummary({ request }: { request: AuthRequestSummary }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><ShieldOutlined color="primary" /><Box><Typography sx={{ fontWeight: 700 }}>{request.requestDeviceIdentifier}</Typography><Typography color="text.secondary" variant="body2">{new Date(request.creationDate).toLocaleString()}</Typography></Box></Stack>
      <Typography variant="body2" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><LocationOnOutlined fontSize="small" />{[request.countryCode, request.ipAddress].filter(Boolean).join(" · ") || "位置未知"}</Typography>
      <Box><Typography color="text.secondary" variant="caption">指纹短语</Typography><Box component="code" sx={{ display: "block", mt: 0.5, p: 1.5, borderRadius: 2, bgcolor: "action.hover", overflowWrap: "anywhere", userSelect: "all" }}>{request.fingerprintPhrase}</Box></Box>
    </Stack>
  );
}

export function AuthRequestApproval({ requests, busy, onBusyChange, onHandled, onError }: { requests: AuthRequestSummary[]; busy: boolean; onBusyChange(value: boolean): void; onHandled(): Promise<void> | void; onError(message: string): void }) {
  const [decision, setDecision] = useState<{ request: AuthRequestSummary; approved: boolean } | null>(null);
  const handle = async (request: AuthRequestSummary, approved: boolean) => {
    onBusyChange(true);
    onError("");
    try {
      if (approved) await approveAuthRequest(request);
      else await respondToAuthRequest(request.id, false);
      setDecision(null);
      await onHandled();
    } catch (error) {
      onError(error instanceof Error ? error.message : "登录请求处理失败。");
    } finally {
      onBusyChange(false);
    }
  };
  if (requests.length === 0) return <Typography color="text.secondary">没有待处理登录请求。</Typography>;
  return (
    <>
      <Stack spacing={1.5}>
        {requests.map((request) => <Card component="article" variant="outlined" key={request.id}><CardContent><RequestSummary request={request} /><Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}><Button startIcon={<CloseOutlined />} disabled={busy} color="error" onClick={() => setDecision({ request, approved: false })}>拒绝</Button><Button startIcon={<CheckOutlined />} disabled={busy} variant="contained" onClick={() => setDecision({ request, approved: true })}>批准</Button></Stack></CardContent></Card>)}
      </Stack>
      <Dialog open={decision !== null} onClose={() => { if (!busy) setDecision(null); }} aria-labelledby="auth-request-dialog-title">
        {busy ? <LinearProgress aria-label="正在处理登录请求" /> : null}
        <DialogTitle id="auth-request-dialog-title">{decision?.approved ? "确认批准登录" : "确认拒绝登录"}</DialogTitle>
        <DialogContent><DialogContentText sx={{ mb: 2 }}>请在操作前再次核对设备、位置和指纹短语。</DialogContentText>{decision ? <RequestSummary request={decision.request} /> : null}</DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setDecision(null)}>取消</Button><Button startIcon={decision?.approved ? <CheckOutlined /> : <CloseOutlined />} variant="contained" color={decision?.approved ? "primary" : "error"} disabled={busy || !decision} onClick={() => { if (decision) void handle(decision.request, decision.approved); }}>{decision?.approved ? "确认批准" : "确认拒绝"}</Button></DialogActions>
      </Dialog>
    </>
  );
}
