(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('TurboOS requires an Unsandboxed extension.');
    }

    class TurboOS {
        constructor() {
            this.running = false;
            this.state = 'off';
            this.frame = 0;

            this.cpuTicks = 0;
            this.timerTicks = 0;
            this.memoryTotal = 64 * 1024 * 1024;
            this.memoryUsed = 4 * 1024 * 1024;

            this.nextPid = 1;
            this.processes = [];
            this.currentPid = 0;
            this.schedulerIndex = -1;

            this.pendingInterrupts = [];
            this.handledInterrupts = 0;
            this.devices = new Map();

            this.mouseX = 0;
            this.mouseY = 0;
            this.keysDown = new Set();
            this.lastKey = '';
            this.inputInstalled = false;

            this.fs = this.createFilesystem();
            this.openFiles = new Map();
            this.nextFd = 3;

            this.lastSyscall = '';
            this.syscallResult = '';

            this.networkStatus = 'offline';
            this.networkLastURL = '';
            this.networkLastStatus = 0;
            this.networkLastText = '';
            this.networkLastError = '';
            this.networkBusy = false;

            this.stageWidth = 480;
            this.stageHeight = 360;
            this.stageCanvas = null;
            this.overlay = null;
            this.canvas = null;
            this.ctx = null;
            this.resizeObserver = null;
            this.animationFrame = 0;

            this.registerDevices();
            this.installStyles();
            this.ensureOverlay();
            this.installInputManager();
            this.startRenderLoop();
        }

        getInfo() {
            return {
                id: 'turboos',
                name: 'TurboOS',
                color1: '#2563eb',
                color2: '#1d4ed8',
                color3: '#1e3a8a',
                blocks: [
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'startOS', text: 'OSを起動' },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'stepFrame',
                        text: 'OSを [N] f 進める',
                        arguments: { N: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'restart', text: 'OSを再起動' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'shutdown', text: 'OSを終了' },
                    '---',
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'spawnProcess',
                        text: 'プロセス [NAME] を起動',
                        arguments: { NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'app' } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'killProcess',
                        text: 'PID [PID] を終了',
                        arguments: { PID: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'raiseInterrupt',
                        text: 'IRQ [IRQ] を発生',
                        arguments: { IRQ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 32 } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'sendKernelCommand',
                        text: 'カーネルに [CMD] を送る',
                        arguments: { CMD: { type: Scratch.ArgumentType.STRING, defaultValue: 'ping' } }
                    },
                    '---',
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'fsMkdir',
                        text: 'mkdir [PATH]',
                        arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/home/user' } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'fsWrite',
                        text: 'write [PATH] = [TEXT]',
                        arguments: {
                            PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' },
                            TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'fsDelete',
                        text: 'rm [PATH]',
                        arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'syscall',
                        text: 'syscall [NAME] [A1] [A2]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'write' },
                            A1: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' },
                            A2: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'fsRead',
                        text: 'read [PATH]',
                        arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' } }
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'fsList',
                        text: 'ls [PATH]',
                        arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/' } }
                    },
                    {
                        blockType: Scratch.BlockType.BOOLEAN,
                        opcode: 'fsExists',
                        text: 'exists [PATH]?',
                        arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' } }
                    },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'syscallResult', text: 'syscall結果' },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'networkConnect', text: 'ネットワーク接続' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'networkDisconnect', text: 'ネットワーク切断' },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'networkGet',
                        text: 'GET [URL]',
                        arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com' } }
                    },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkStatusReporter', text: 'ネット状態' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkHTTPStatus', text: 'HTTP状態' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkResponse', text: 'ネット応答' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkError', text: 'ネットエラー' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'networkBusyReporter', text: '通信中？' },
                    '---',
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osState', text: 'OS状態' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osFrame', text: 'OSフレーム' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'cpuTicksReporter', text: 'CPU tick' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'timerTicksReporter', text: 'Timer tick' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'memoryUsedReporter', text: '使用メモリ(MB)' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'memoryTotalReporter', text: '総メモリ(MB)' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'processCountReporter', text: 'プロセス数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'currentPidReporter', text: '現在PID' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'pendingInterruptsReporter', text: '保留IRQ' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'handledInterruptsReporter', text: '処理IRQ' },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'keyDownReporter',
                        text: 'キー [KEY] down?',
                        arguments: { KEY: { type: Scratch.ArgumentType.STRING, defaultValue: 'Space' } }
                    },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'lastKeyReporter', text: '最後のキー' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseXReporter', text: 'OSマウス x' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseYReporter', text: 'OSマウス y' },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'deviceStatus',
                        text: 'device [DEVICE]',
                        arguments: { DEVICE: { type: Scratch.ArgumentType.STRING, defaultValue: 'keyboard' } }
                    },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'kernelResponse', text: 'kernel応答' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'isRunning', text: 'OS起動中？' }
                ]
            };
        }

        str(value, fallback = '') {
            return value === null || value === undefined ? fallback : String(value);
        }

        num(value, fallback = 0) {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        }

        int(value, fallback = 0) {
            return Math.trunc(this.num(value, fallback));
        }

        count(value) {
            return Math.max(0, Math.min(10000, this.int(value, 1)));
        }

        createFilesystem() {
            return {
                type: 'dir', name: '/', children: {
                    home: { type: 'dir', name: 'home', children: {
                        user: { type: 'dir', name: 'user', children: {} }
                    } },
                    etc: { type: 'dir', name: 'etc', children: {} },
                    bin: { type: 'dir', name: 'bin', children: {} },
                    tmp: { type: 'dir', name: 'tmp', children: {} },
                    dev: { type: 'dir', name: 'dev', children: {} },
                    net: { type: 'dir', name: 'net', children: {} }
                }
            };
        }

        normalizePath(path) {
            const raw = this.str(path, '/').replace(/\\/g, '/');
            const absolute = raw.startsWith('/');
            const parts = absolute ? [] : ['home', 'user'];
            for (const part of raw.split('/')) {
                if (!part || part === '.') continue;
                if (part === '..') {
                    if (parts.length) parts.pop();
                } else {
                    parts.push(part);
                }
            }
            return parts;
        }

        nodeAt(path) {
            const parts = Array.isArray(path) ? path : this.normalizePath(path);
            let node = this.fs;
            for (const part of parts) {
                if (!node || node.type !== 'dir' || !node.children[part]) return null;
                node = node.children[part];
            }
            return node;
        }

        parentAt(path) {
            const parts = this.normalizePath(path);
            if (!parts.length) return null;
            const name = parts.pop();
            return { parent: this.nodeAt(parts), name };
        }

        fsMkdir(args) {
            const t = this.parentAt(this.str(args.PATH, '/'));
            if (!t || !t.parent || t.parent.type !== 'dir') return this.syscallResult = 'ENOENT';
            if (t.parent.children[t.name]) return this.syscallResult = 'EEXIST';
            t.parent.children[t.name] = { type: 'dir', name: t.name, children: {} };
            this.memoryUsed = Math.min(this.memoryTotal, this.memoryUsed + 64);
            this.syscallResult = '0';
        }

        fsWrite(args) {
            const t = this.parentAt(this.str(args.PATH, '/'));
            if (!t || !t.parent || t.parent.type !== 'dir') return this.syscallResult = 'ENOENT';
            if (t.parent.children[t.name]?.type === 'dir') return this.syscallResult = 'EISDIR';
            const text = this.str(args.TEXT, '');
            const old = t.parent.children[t.name];
            const oldSize = old?.type === 'file' ? old.content.length : 0;
            t.parent.children[t.name] = { type: 'file', name: t.name, content: text, size: text.length };
            this.memoryUsed = Math.min(this.memoryTotal, Math.max(4 * 1024 * 1024, this.memoryUsed - oldSize + text.length));
            this.syscallResult = String(text.length);
        }

        fsDelete(args) {
            const t = this.parentAt(this.str(args.PATH, '/'));
            if (!t || !t.parent || !t.parent.children[t.name]) return this.syscallResult = 'ENOENT';
            delete t.parent.children[t.name];
            this.syscallResult = '0';
        }

        fsRead(args) {
            const node = this.nodeAt(this.str(args.PATH, '/'));
            return node?.type === 'file' ? node.content : '';
        }

        fsList(args) {
            const node = this.nodeAt(this.str(args.PATH, '/'));
            if (!node || node.type !== 'dir') return '';
            return Object.keys(node.children).sort().map(name => node.children[name].type === 'dir' ? name + '/' : name).join('  ');
        }

        fsExists(args) {
            return !!this.nodeAt(this.str(args.PATH, '/'));
        }

        openFile(path) {
            if (!this.nodeAt(path)) this.fsWrite({ PATH: path, TEXT: '' });
            const fd = this.nextFd++;
            this.openFiles.set(fd, this.str(path));
            return fd;
        }

        closeFile(fd) {
            return this.openFiles.delete(this.int(fd, -1));
        }

        syscall(args) {
            const name = this.str(args.NAME).trim().toLowerCase();
            const a1 = this.str(args.A1);
            const a2 = this.str(args.A2);
            this.lastSyscall = name;
            switch (name) {
                case 'mkdir': this.fsMkdir({ PATH: a1 }); break;
                case 'write': this.fsWrite({ PATH: a1, TEXT: a2 }); break;
                case 'read': this.syscallResult = this.fsRead({ PATH: a1 }); break;
                case 'delete': case 'unlink': this.fsDelete({ PATH: a1 }); break;
                case 'list': this.syscallResult = this.fsList({ PATH: a1 }); break;
                case 'exists': this.syscallResult = this.fsExists({ PATH: a1 }) ? '1' : '0'; break;
                case 'open': this.syscallResult = String(this.openFile(a1)); break;
                case 'close': this.syscallResult = this.closeFile(a1) ? '0' : 'EBADF'; break;
                default: this.syscallResult = 'ENOSYS';
            }
        }

        registerDevices() {
            for (const name of ['cpu', 'memory', 'display', 'keyboard', 'mouse', 'timer', 'storage', 'network']) {
                this.devices.set(name, { connected: true, status: 'online' });
            }
        }

        installInputManager() {
            if (this.inputInstalled) return;
            this.inputInstalled = true;
            window.addEventListener('keydown', e => {
                this.keysDown.add(e.key);
                this.lastKey = e.key;
                this.raiseInterruptInternal(33, { type: 'keyboard', action: 'down', key: e.key, code: e.code });
            });
            window.addEventListener('keyup', e => {
                this.keysDown.delete(e.key);
                this.raiseInterruptInternal(33, { type: 'keyboard', action: 'up', key: e.key, code: e.code });
            });
            window.addEventListener('pointermove', e => this.updatePointer(e));
            window.addEventListener('pointerdown', e => {
                this.updatePointer(e);
                this.raiseInterruptInternal(34, { type: 'mouse', action: 'down', button: e.button, x: this.mouseX, y: this.mouseY });
            });
            window.addEventListener('pointerup', e => {
                this.updatePointer(e);
                this.raiseInterruptInternal(34, { type: 'mouse', action: 'up', button: e.button, x: this.mouseX, y: this.mouseY });
            });
        }

        updatePointer(event) {
            if (!this.stageCanvas) return;
            const r = this.stageCanvas.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            this.mouseX = ((event.clientX - r.left) / r.width) * this.stageWidth - this.stageWidth / 2;
            this.mouseY = this.stageHeight / 2 - ((event.clientY - r.top) / r.height) * this.stageHeight;
        }

        enqueueInterrupt(irq, data = {}) {
            const n = this.int(irq, 32);
            this.pendingInterrupts.push({ irq: n, frame: this.frame, data });
            if (this.pendingInterrupts.length > 128) this.pendingInterrupts.shift();
        }

        raiseInterruptInternal(irq, data) {
            this.enqueueInterrupt(irq, data);
        }

        handleInterrupts() {
            const limit = Math.min(8, this.pendingInterrupts.length);
            for (let i = 0; i < limit; i++) {
                const irq = this.pendingInterrupts.shift();
                this.handledInterrupts++;
                if (irq.irq === 33 && irq.data.action === 'down') this.cpuTicks++;
            }
        }

        timerStep() {
            this.timerTicks++;
            this.enqueueInterrupt(32, { type: 'timer', tick: this.timerTicks });
        }

        scheduleProcess() {
            if (!this.processes.length) {
                this.currentPid = 0;
                return;
            }
            for (const p of this.processes) p.state = 'ready';
            this.schedulerIndex = (this.schedulerIndex + 1) % this.processes.length;
            const p = this.processes[this.schedulerIndex];
            p.state = 'running';
            p.cpuTime++;
            this.currentPid = p.pid;
        }

        kernelTick() {
            this.cpuTicks++;
            this.uptimeTick();
            this.timerStep();
            this.handleInterrupts();
            this.scheduleProcess();
        }

        uptimeTick() {
            this.uptime = (this.uptime || 0) + 1;
        }

        spawnProcess(args) {
            if (!this.running) return;
            const name = this.str(args.NAME, 'app').trim() || 'app';
            const p = { pid: this.nextPid++, name, state: 'ready', cpuTime: 0 };
            this.processes.push(p);
            this.memoryUsed = Math.min(this.memoryTotal, this.memoryUsed + 128 * 1024);
        }

        killProcess(args) {
            const pid = this.int(args.PID, -1);
            const index = this.processes.findIndex(p => p.pid === pid);
            if (index < 0) return;
            this.processes.splice(index, 1);
            if (this.currentPid === pid) this.currentPid = 0;
            this.memoryUsed = Math.max(4 * 1024 * 1024, this.memoryUsed - 128 * 1024);
        }

        sendKernelCommand(args) {
            const cmd = this.str(args.CMD).trim().toLowerCase();
            switch (cmd) {
                case 'ping': this.kernelResponse = 'pong'; break;
                case 'status': this.kernelResponse = `${this.state} frame=${this.frame} pid=${this.currentPid}`; break;
                case 'sync': this.handleInterrupts(); this.kernelResponse = 'ok'; break;
                default: this.kernelResponse = 'ENOSYS';
            }
            this.syscallResult = this.kernelResponse;
        }

        networkConnect() {
            this.networkStatus = 'online';
            this.networkLastError = '';
            const dev = this.devices.get('network');
            if (dev) dev.status = 'online';
            this.enqueueInterrupt(35, { type: 'network', action: 'connect' });
        }

        networkDisconnect() {
            this.networkStatus = 'offline';
            this.networkBusy = false;
            this.networkLastError = '';
            const dev = this.devices.get('network');
            if (dev) dev.status = 'offline';
            this.enqueueInterrupt(35, { type: 'network', action: 'disconnect' });
        }

        async networkGet(args) {
            const url = this.str(args.URL).trim();
            if (!url) return;
            if (this.networkStatus !== 'online') {
                this.networkLastError = 'ENETDOWN';
                return;
            }
            this.networkBusy = true;
            this.networkLastURL = url;
            this.networkLastStatus = 0;
            this.networkLastText = '';
            this.networkLastError = '';
            this.enqueueInterrupt(35, { type: 'network', action: 'request', url });
            try {
                const response = await fetch(url, { method: 'GET' });
                this.networkLastStatus = response.status;
                this.networkLastText = await response.text();
                this.syscallResult = String(response.status);
            } catch (e) {
                this.networkLastError = this.str(e?.message, 'Network error');
                this.syscallResult = 'EIO';
            } finally {
                this.networkBusy = false;
                this.enqueueInterrupt(35, { type: 'network', action: 'complete', url });
            }
        }

        installStyles() {
            if (document.getElementById('turboos-stage-style')) return;
            const style = document.createElement('style');
            style.id = 'turboos-stage-style';
            style.textContent = '#turboos-stage-overlay{position:absolute;z-index:20;overflow:hidden;pointer-events:auto}#turboos-stage-overlay canvas{display:block;width:100%;height:100%;cursor:default}';
            document.head.appendChild(style);
        }

        ensureOverlay() {
            const canvas = Scratch.renderer && Scratch.renderer.canvas;
            if (!canvas || !canvas.parentElement) return false;
            if (canvas === this.stageCanvas && this.overlay) return true;
            this.stageCanvas = canvas;
            if (this.overlay) this.overlay.remove();
            const parent = canvas.parentElement;
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

            this.overlay = document.createElement('div');
            this.overlay.id = 'turboos-stage-overlay';
            this.overlay.style.display = 'none';
            this.canvas = document.createElement('canvas');
            this.overlay.appendChild(this.canvas);
            parent.appendChild(this.overlay);
            this.ctx = this.canvas.getContext('2d');

            this.overlay.addEventListener('pointerdown', e => this.handleStagePointer(e));
            this.overlay.addEventListener('dblclick', e => this.handleStageDoubleClick(e));

            if (typeof ResizeObserver !== 'undefined') {
                if (this.resizeObserver) this.resizeObserver.disconnect();
                this.resizeObserver = new ResizeObserver(() => this.syncStageSize());
                this.resizeObserver.observe(canvas);
            }
            this.syncStageSize();
            return true;
        }

        syncStageSize() {
            if (!this.stageCanvas || !this.overlay || !this.canvas || !this.ctx) return;
            const r = this.stageCanvas.getBoundingClientRect();
            const p = this.stageCanvas.parentElement.getBoundingClientRect();
            this.overlay.style.left = `${r.left - p.left}px`;
            this.overlay.style.top = `${r.top - p.top}px`;
            this.overlay.style.width = `${r.width}px`;
            this.overlay.style.height = `${r.height}px`;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            this.canvas.width = Math.max(1, Math.round(r.width * dpr));
            this.canvas.height = Math.max(1, Math.round(r.height * dpr));
            this.ctx.setTransform((r.width * dpr) / this.stageWidth, 0, 0, (r.height * dpr) / this.stageHeight, (r.width * dpr) / 2, (r.height * dpr) / 2);
            this.render();
        }

        startRenderLoop() {
            if (this.animationFrame) return;
            const loop = () => {
                this.animationFrame = requestAnimationFrame(loop);
                if (this.state !== 'off') this.render();
            };
            this.animationFrame = requestAnimationFrame(loop);
        }

        clear() {
            if (!this.ctx || !this.canvas) return;
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }

        roundedRect(x, y, w, h, radius) {
            const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
            this.ctx.beginPath();
            this.ctx.moveTo(x + r, y);
            this.ctx.arcTo(x + w, y, x + w, y + h, r);
            this.ctx.arcTo(x + w, y + h, x, y + h, r);
            this.ctx.arcTo(x, y + h, x, y, r);
            this.ctx.arcTo(x, y, x + w, y, r);
            this.ctx.closePath();
        }

        text(value, x, y, size, color = '#fff', align = 'left') {
            this.ctx.fillStyle = color;
            this.ctx.font = `${size}px system-ui, sans-serif`;
            this.ctx.textAlign = align;
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(String(value), x, y);
        }

        render() {
            if (!this.ctx || !this.canvas || !this.overlay) {
                this.ensureOverlay();
                if (!this.ctx) return;
            }
            this.overlay.style.display = this.state === 'off' ? 'none' : 'block';
            if (this.state === 'off') return this.clear();
            this.clear();
            this.ctx.fillStyle = this.state === 'desktop' ? '#101827' : '#020617';
            this.ctx.fillRect(-this.stageWidth / 2, -this.stageHeight / 2, this.stageWidth, this.stageHeight);
            if (this.state === 'boot') this.renderBoot();
            else if (this.state === 'kernel') this.renderKernel();
            else if (this.state === 'services') this.renderServices();
            else this.renderDesktop();
        }

        renderBoot() {
            this.text('TurboOS', 0, -82, 42, '#fff', 'center');
            this.text('Firmware / Bootloader', 0, -48, 15, '#93c5fd', 'center');
            const list = ['Virtual CPU', 'Virtual memory', 'Display', 'Input', 'System bus'];
            const count = Math.min(list.length, Math.floor(this.frame / 6) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${list[i]}`, -150, -5 + i * 25, 13, '#cbd5e1');
            this.ctx.fillStyle = '#1e293b';
            this.ctx.fillRect(-150, 126, 300, 8);
            this.ctx.fillStyle = '#3b82f6';
            this.ctx.fillRect(-150, 126, Math.min(300, this.frame * 5), 8);
        }

        renderKernel() {
            this.text('TurboOS Kernel', 0, -80, 34, '#fff', 'center');
            this.text('Kernel initialization', 0, -48, 14, '#93c5fd', 'center');
            const list = ['CPU scheduler', 'Memory manager', 'Input manager', 'Display driver', 'Timer', 'Interrupt controller'];
            const count = Math.min(list.length, Math.floor((this.frame - 30) / 5) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${list[i]}`, -145, -14 + i * 24, 13, '#cbd5e1');
        }

        renderServices() {
            this.text('TurboOS', 0, -82, 38, '#fff', 'center');
            this.text('Starting services', 0, -49, 15, '#93c5fd', 'center');
            const list = ['Process manager', 'Window manager', 'Filesystem', 'Event dispatcher', 'Network manager'];
            const count = Math.min(list.length, Math.floor((this.frame - 62) / 5) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${list[i]}`, -140, -12 + i * 24, 13, '#cbd5e1');
        }

        renderDesktop() {
            const w = this.stageWidth, h = this.stageHeight, ctx = this.ctx;
            const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
            g.addColorStop(0, '#182437');
            g.addColorStop(1, '#08101d');
            ctx.fillStyle = g;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.fillStyle = 'rgba(10,15,24,.94)';
            ctx.fillRect(-w / 2, -h / 2, w, 28);
            this.text('TurboOS', -220, -166, 13, '#f8fafc');
            this.text('Desktop', -165, -166, 12, '#94a3b8');
            this.desktopIcon(-180, -90, '▣', 'System');
            this.desktopIcon(-100, -90, '□', 'Files');
            this.desktopIcon(-20, -90, '›_', 'Terminal');
            ctx.fillStyle = 'rgba(15,23,42,.82)';
            this.roundedRect(-150, -25, 300, 135, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(148,163,184,.18)';
            ctx.stroke();
            this.text('Welcome to TurboOS', 0, 5, 22, '#f8fafc', 'center');
            this.text('Stage-based virtual operating system', 0, 36, 13, '#94a3b8', 'center');
            this.text(`Processes: ${this.processes.length}`, 0, 66, 12, '#60a5fa', 'center');
            ctx.fillStyle = 'rgba(10,15,24,.96)';
            ctx.fillRect(-w / 2, h / 2 - 34, w, 34);
            this.text('◈', -220, 143, 16, '#60a5fa', 'center');
            this.text('TurboOS', -185, 143, 12, '#e2e8f0');
            this.text('Virtual Desktop', 185, 143, 11, '#94a3b8', 'right');
        }

        desktopIcon(x, y, icon, label) {
            this.ctx.fillStyle = 'rgba(255,255,255,.06)';
            this.roundedRect(x - 26, y - 25, 52, 52, 8);
            this.ctx.fill();
            this.text(icon, x, y - 2, 23, '#93c5fd', 'center');
            this.text(label, x, y + 45, 11, '#e2e8f0', 'center');
        }

        handleStagePointer(event) {
            if (!this.running || this.state !== 'desktop') return;
            const r = this.stageCanvas.getBoundingClientRect();
            const x = ((event.clientX - r.left) / r.width) * this.stageWidth - this.stageWidth / 2;
            const y = this.stageHeight / 2 - ((event.clientY - r.top) / r.height) * this.stageHeight;
            this.mouseX = x;
            this.mouseY = y;
            if (x >= -215 && x <= -145 && y >= -130 && y <= -35) {
                this.openSystem();
            } else if (x >= -135 && x <= -65 && y >= -130 && y <= -35) {
                this.openFiles();
            } else if (x >= -55 && x <= 15 && y >= -130 && y <= -35) {
                this.openTerminal();
            }
        }

        handleStageDoubleClick(event) {
            this.handleStagePointer(event);
        }

        showInfoWindow(title, lines) {
            const parent = this.stageCanvas?.parentElement;
            if (!parent) return;
            let info = parent.querySelector('.turboos-info-window');
            if (info) info.remove();
            info = document.createElement('div');
            info.className = 'turboos-info-window';
            info.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#111827;color:#fff;border:1px solid #475569;border-radius:8px;padding:16px;z-index:50;min-width:240px;font:13px monospace;box-shadow:0 12px 40px rgba(0,0,0,.5)';
            info.innerHTML = `<b>${this.escape(title)}</b><br><br>${lines.map(this.escape).join('<br>')}<br><br>`;
            const close = document.createElement('button');
            close.textContent = '閉じる';
            close.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:5px;padding:6px 10px;cursor:pointer';
            close.onclick = () => info.remove();
            info.appendChild(close);
            parent.appendChild(info);
        }

        escape(value) {
            return this.str(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
        }

        openSystem() {
            this.showInfoWindow('System', [
                `state=${this.state}`,
                `frame=${this.frame}`,
                `cpu=${this.cpuTicks}`,
                `memory=${(this.memoryUsed / 1024 / 1024).toFixed(1)}MB / ${(this.memoryTotal / 1024 / 1024).toFixed(0)}MB`,
                `processes=${this.processes.length}`,
                `network=${this.networkStatus}`
            ]);
        }

        openFiles() {
            this.showInfoWindow('Files', [this.fsList({ PATH: '/' }) || '(empty)', 'TurboFS virtual storage']);
        }

        openTerminal() {
            this.showInfoWindow('Terminal', [
                'TurboOS terminal shell',
                'Use the TurboOS blocks for filesystem/syscall commands.',
                `PWD=/home/user`
            ]);
        }

        startOS() {
            if (this.running) return;
            this.running = true;
            this.state = 'boot';
            this.frame = 0;
            this.cpuTicks = 0;
            this.timerTicks = 0;
            this.uptime = 0;
            this.pendingInterrupts.length = 0;
            this.processes.length = 0;
            this.currentPid = 0;
            this.ensureOverlay();
            this.render();
        }

        stepFrame(args) {
            if (!this.running) return;
            const n = Math.max(1, this.count(args.N));
            for (let i = 0; i < n; i++) {
                this.frame++;
                if (this.frame < 32) this.state = 'boot';
                else if (this.frame < 64) this.state = 'kernel';
                else if (this.frame < 90) this.state = 'services';
                else this.state = 'desktop';
                this.kernelTick();
            }
            this.render();
        }

        restart() {
            this.shutdown();
            this.startOS();
        }

        shutdown() {
            this.running = false;
            this.state = 'off';
            this.frame = 0;
            this.currentPid = 0;
            this.pendingInterrupts.length = 0;
            this.render();
        }

        osState() { return this.state; }
        osFrame() { return this.frame; }
        cpuTicksReporter() { return this.cpuTicks; }
        timerTicksReporter() { return this.timerTicks; }
        memoryUsedReporter() { return Number((this.memoryUsed / 1024 / 1024).toFixed(2)); }
        memoryTotalReporter() { return 64; }
        processCountReporter() { return this.processes.length; }
        currentPidReporter() { return this.currentPid; }
        pendingInterruptsReporter() { return this.pendingInterrupts.length; }
        handledInterruptsReporter() { return this.handledInterrupts; }
        lastKeyReporter() { return this.lastKey; }
        keyDownReporter(args) { return this.keysDown.has(this.str(args.KEY)); }
        mouseXReporter() { return this.mouseX; }
        mouseYReporter() { return this.mouseY; }
        deviceStatus(args) { return this.devices.get(this.str(args.DEVICE))?.status || 'unknown'; }
        kernelResponse() { return this.kernelResponse || ''; }
        syscallResult() { return this.syscallResult || ''; }
        networkStatusReporter() { return this.networkStatus; }
        networkHTTPStatus() { return this.networkLastStatus; }
        networkResponse() { return this.networkLastText; }
        networkError() { return this.networkLastError; }
        networkBusyReporter() { return this.networkBusy; }
        isRunning() { return this.running; }
        osUptime() { return this.uptime || 0; }
    }

    Scratch.extensions.register(new TurboOS());
})(Scratch);
