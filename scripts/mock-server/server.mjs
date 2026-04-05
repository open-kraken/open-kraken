import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixturePath = fileURLToPath(new URL('../../backend/tests/fixtures/workspace-fixture.json', import.meta.url));

const loadState = async () => JSON.parse(await readFile(fixturePath, 'utf8'));

const clone = (value) => JSON.parse(JSON.stringify(value));

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const wsFrame = (text) => {
  const payload = Buffer.from(text);
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  if (payload.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  throw new Error('mock websocket payload exceeds 65535 bytes');
};

const createBroadcastEvent = (state) => {
  const conversation = state.conversations[0];
  const lastMessage = state.messages[conversation.id][state.messages[conversation.id].length - 1];
  const session = state.terminalSessions[0];
  return [
    {
      event: 'chat.snapshot',
      workspaceId: state.workspace.id,
      conversationId: conversation.id,
      messageIds: state.messages[conversation.id].map((message) => message.id)
    },
    {
      event: 'chat.delta',
      workspaceId: state.workspace.id,
      conversationId: conversation.id,
      messageId: lastMessage.id,
      sequence: state.messages[conversation.id].length,
      body: lastMessage.content?.text ?? ''
    },
    {
      event: 'presence.snapshot',
      workspaceId: state.workspace.id,
      members: state.members.members.map((member) => ({
        memberId: member.memberId,
        presenceState: member.manualStatus,
        terminalStatus: member.terminalStatus,
        lastHeartbeat: new Date().toISOString()
      }))
    },
    {
      event: 'presence.updated',
      workspaceId: state.workspace.id,
      memberId: state.members.members[0].memberId,
      presenceState: state.members.members[0].manualStatus,
      sentAt: new Date().toISOString()
    },
    {
      event: 'roadmap.updated',
      workspaceId: state.workspace.id,
      roadmap: state.roadmap
    },
    {
      event: 'terminal.attach',
      workspaceId: state.workspace.id,
      terminalId: session.terminalId,
      session
    },
    {
      event: 'terminal.snapshot',
      workspaceId: state.workspace.id,
      terminalId: session.terminalId,
      connectionState: 'attached',
      processState: 'running',
      rows: session.snapshot.buffer.rows,
      cols: session.snapshot.buffer.cols,
      buffer: session.snapshot.buffer.data
    },
    {
      event: 'terminal.delta',
      workspaceId: state.workspace.id,
      terminalId: session.terminalId,
      data: 'verify:migration completed\\n',
      sequence: session.seq
    },
    {
      event: 'terminal.status',
      workspaceId: state.workspace.id,
      terminalId: session.terminalId,
      connectionState: 'attached',
      processState: session.status === 'working' ? 'running' : 'idle',
      reason: 'mock'
    },
    {
      event: 'chat.status',
      workspaceId: state.workspace.id,
      conversationId: conversation.id,
      messageId: lastMessage.id,
      status: lastMessage.status
    }
  ];
};

export const startMockServer = async ({ port = 0 } = {}) => {
  const state = await loadState();
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, workspaceId: state.workspace.id });
    }
    if (parts[0] === 'api' && parts[1] === 'v1') {
      parts = ['api', ...parts.slice(2)];
    }
    if (parts[0] === 'api' && parts[1] === 'ledger' && parts[2] === 'events') {
      if (req.method === 'GET') {
        const items = [
          {
            id: 'led_demo_1',
            workspaceId: state.workspace.id,
            teamId: 'team_platform',
            memberId: 'owner_1',
            nodeId: 'node-1',
            eventType: 'terminal.command',
            summary: 'npm run verify:all',
            correlationId: 'run_demo_1',
            sessionId: 'term_owner_1',
            context: { cwd: state.workspace.rootPath ?? '/repo', exitCode: 0 },
            timestamp: new Date().toISOString()
          }
        ];
        return sendJson(res, 200, { items, total: items.length });
      }
      if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        return sendJson(res, 201, {
          id: `led_${Date.now()}`,
          workspaceId: body.workspaceId ?? state.workspace.id,
          teamId: body.teamId ?? '',
          memberId: body.memberId ?? '',
          nodeId: body.nodeId ?? '',
          eventType: body.eventType ?? '',
          summary: body.summary ?? '',
          correlationId: body.correlationId ?? '',
          sessionId: body.sessionId ?? '',
          context: body.context ?? {},
          timestamp: new Date().toISOString()
        });
      }
    }
    if (parts[0] !== 'api' || parts[1] !== 'workspaces' || parts[2] !== state.workspace.id) {
      return sendJson(res, 404, { error: 'not_found' });
    }
    if (req.method === 'GET' && parts[3] === 'conversations' && parts.length === 4) {
      return sendJson(res, 200, { workspace: state.workspace, conversations: state.conversations });
    }
    if (req.method === 'GET' && parts[3] === 'conversations' && parts[5] === 'messages') {
      return sendJson(res, 200, {
        items: state.messages[parts[4]] ?? [],
        nextBeforeId: null
      });
    }
    if (req.method === 'POST' && parts[3] === 'conversations' && parts[5] === 'messages') {
      const body = JSON.parse(await readBody(req));
      const message = {
        id: `msg_${Date.now()}`,
        senderId: body.senderId,
        content: body.content,
        createdAt: Date.now(),
        isAi: Boolean(body.isAI),
        status: 'sent',
        attachment: body.attachment ?? null
      };
      state.messages[parts[4]] = [...(state.messages[parts[4]] ?? []), message];
      const conversation = state.conversations.find((item) => item.id === parts[4]);
      if (conversation) {
        conversation.lastMessageAt = message.createdAt;
        conversation.lastMessagePreview = body.content?.text ?? '';
      }
      broadcast(sockets, {
        event: 'chat.delta',
        workspaceId: state.workspace.id,
        conversationId: parts[4],
        messageId: message.id,
        sequence: state.messages[parts[4]].length,
        body: body.content?.text ?? ''
      });
      broadcast(sockets, {
        event: 'chat.status',
        workspaceId: state.workspace.id,
        conversationId: parts[4],
        messageId: message.id,
        status: message.status
      });
      return sendJson(res, 201, { messageId: message.id, message });
    }
    if (req.method === 'GET' && parts[3] === 'members') {
      return sendJson(res, 200, { readOnly: state.workspace.readOnly, members: state.members });
    }
    if (req.method === 'PATCH' && parts[3] === 'members' && parts[4] === 'status') {
      const body = JSON.parse(await readBody(req));
      const next = state.members.members.find((member) => member.memberId === body.memberId);
      if (!next) {
        return sendJson(res, 404, { error: 'member_not_found' });
      }
      next.manualStatus = body.manualStatus ?? next.manualStatus;
      next.terminalStatus = body.terminalStatus ?? next.terminalStatus;
      const event = {
        event: 'presence.snapshot',
        workspaceId: state.workspace.id,
        members: state.members.members.map((member) => ({
          memberId: member.memberId,
          presenceState: member.manualStatus,
          terminalStatus: member.terminalStatus,
          lastHeartbeat: new Date().toISOString()
        }))
      };
      broadcast(sockets, event);
      broadcast(sockets, {
        event: 'presence.updated',
        workspaceId: state.workspace.id,
        memberId: next.memberId,
        presenceState: next.manualStatus,
        sentAt: new Date().toISOString()
      });
      return sendJson(res, 200, event);
    }
    if (req.method === 'GET' && parts[3] === 'roadmap') {
      return sendJson(res, 200, { readOnly: state.workspace.readOnly, roadmap: state.roadmap });
    }
    if (req.method === 'PUT' && parts[3] === 'roadmap') {
      const body = JSON.parse(await readBody(req));
      state.roadmap = body.roadmap;
      state.projectData.roadmap = body.roadmap;
      const event = { event: 'roadmap.updated', workspaceId: state.workspace.id, roadmap: state.roadmap };
      broadcast(sockets, event);
      return sendJson(res, 200, {
        readOnly: state.workspace.readOnly,
        storage: 'workspace',
        warning: '',
        roadmap: state.roadmap
      });
    }
    if (req.method === 'GET' && parts[3] === 'project-data') {
      return sendJson(res, 200, {
        readOnly: state.workspace.readOnly,
        storage: 'workspace',
        warning: '',
        payload: state.projectData
      });
    }
    if (req.method === 'PUT' && parts[3] === 'project-data') {
      const body = JSON.parse(await readBody(req));
      state.projectData = body.payload;
      broadcast(sockets, {
        event: 'project-data.updated',
        workspaceId: state.workspace.id,
        payload: state.projectData
      });
      return sendJson(res, 200, {
        readOnly: state.workspace.readOnly,
        storage: 'workspace',
        warning: '',
        payload: state.projectData
      });
    }
    if (
      req.method === 'GET' &&
      parts[3] === 'terminal' &&
      parts[4] === 'sessions' &&
      parts[6] === 'attach'
    ) {
      const session = state.terminalSessions.find((item) => item.terminalId === parts[5]);
      if (!session) {
        return sendJson(res, 404, { error: 'terminal_not_found' });
      }
      return sendJson(res, 200, { session, snapshot: session.snapshot });
    }
    return sendJson(res, 404, { error: 'not_found' });
  });

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        ''
      ].join('\r\n')
    );
    sockets.add(socket);
    for (const event of createBroadcastEvent(state)) {
      socket.write(wsFrame(JSON.stringify(event)));
    }
    socket.on('close', () => sockets.delete(socket));
    socket.on('end', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(port, resolve));
  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  return {
    port: resolvedPort,
    url: `http://127.0.0.1:${resolvedPort}`,
    wsUrl: `ws://127.0.0.1:${resolvedPort}/ws`,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
};

const broadcast = (sockets, event) => {
  const frame = wsFrame(JSON.stringify(event));
  for (const socket of sockets) {
    socket.write(frame);
  }
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startMockServer({ port: Number(process.env.OPEN_KRAKEN_MOCK_PORT || 4318) });
  process.stdout.write(
    `open-kraken mock server listening on ${server.url} (${path.relative(process.cwd(), fixturePath)})\n`
  );
}
