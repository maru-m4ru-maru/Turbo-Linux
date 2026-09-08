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
            this.background = '#101827';

            // CPU / timer
            this.cpuTicks = 0;
            this.timerTicks = 0;

            // Memory
            this.memoryTotal = 64 * 1024 * 1024;
            this.memoryUsed = 4 * 1024 * 1024;

            // Processes
            this.nextPid = 1;
            this.processes = [];
            this.currentPid = 0;
            this.schedulerIndex = -1;

            // Interrupts
            this.pendingInterrupts = [];
            this.handledInterrupts = 0;

            // Devices
            this.devices = new Map();

            // Input
            this.mouseX = 0;
            this.mouseY = 0;
            this.keysDown = new Set();
            this.lastKey = '';
            this.inputInstalled = false;

            // TurboFS: in-memory virtual disk
            this.fs = this.createFilesystem();
            this.openFiles = new Map();
            this.nextFd = 3;

            // Syscall / network state
            this.lastSyscall = '';
            this.syscallResult = '';
            this.networkStatus = 'offline';
            this.networkLastURL = '';
            this.networkLastStatus = 0;
            this.networkLastText = '';
            this.networkLastError = '';
            this.networkBusy = false;

            // Stage renderer
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
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'stepFrame', text: 'OSを1f進める' },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'stepFrames',
                        text: 'OSを [COUNT] f進める',
                        arguments: { COUNT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'restart', text: 'OSを再起動' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'shutdown', text: 'OSを終了' },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'spawnProcess', text: 'プロセス [NAME] を起動', arguments: { NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'app' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'killProcess', text: 'PID [PID] を終了', arguments: { PID: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'raiseInterrupt', text: 'IRQ [IRQ] を発生させる', arguments: { IRQ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 32 } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'sendKernelCommand', text: 'カーネルに [COMMAND] を送る', arguments: { COMMAND: { type: Scratch.ArgumentType.STRING, defaultValue: 'ping' } } },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'fsMkdir', text: 'ディレクトリ [PATH] を作る', arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/home/user' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'fsWrite', text: 'ファイル [PATH] に [TEXT] を書く', arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' }, TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello TurboOS!' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'fsDelete', text: '[PATH] を削除', arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'syscall', text: 'syscall [NAME] [ARG1] [ARG2]', arguments: {
                        NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'write' },
                        ARG1: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' },
                        ARG2: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello' }
                    } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'fsRead', text: 'ファイル [PATH] を読む', arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'fsList', text: 'ディレクトリ [PATH] の一覧', arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/' } } },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'fsExists', text: '[PATH] が存在する？', arguments: { PATH: { type: Scratch.ArgumentType.STRING, defaultValue: '/hello.txt' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'syscallResult', text: '最後のsyscall結果' },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'networkConnect', text: 'ネットワークに接続' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'networkDisconnect', text: 'ネットワークを切断' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'networkGet', text: 'GET [URL] を実行', arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://example.com' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkStatusReporter', text: 'ネットワーク状態' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkHTTPStatus', text: 'HTTPステータス' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkResponse', text: '最後のネットワーク応答' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'networkError', text: 'ネットワークエラー' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'networkBusyReporter', text: 'ネットワーク通信中？' },
                    '---',
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osState', text: 'OSの状態' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osFrame', text: 'OSのフレーム数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'cpuTicksReporter', text: 'CPU tick' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'timerTicksReporter', text: 'タイマーtick' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'memoryUsedReporter', text: '使用メモリ(MB)' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'memoryTotalReporter', text: '総メモリ(MB)' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'processCountReporter', text: 'プロセス数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'currentPidReporter', text: '現在のPID' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'pendingInterruptsReporter', text: '保留中IRQ数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'handledInterruptsReporter', text: '処理済みIRQ数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'lastKeyReporter', text: '最後に押されたキー' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'keyDownReporter', text: 'キー [KEY] が押されている？', arguments: { KEY: { type: Scratch.ArgumentType.STRING, defaultValue: 'Space' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseXReporter', text: 'OSマウス x' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseYReporter', text: 'OSマウス y' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'deviceStatus', text: 'デバイス [DEVICE] の状態', arguments: { DEVICE: { type: Scratch.ArgumentType.STRING, defaultValue: 'keyboard' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'kernelResponse', text: '最後のカーネル応答' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'isRunning', text: 'OSは起動中？' }
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

        clampCount(value) {
            return Math.max(0, Math.min(10000, this.int(value, 1)));
        }

        createFilesystem() {
            return {
                type: 'dir',
                name: '/',
                children: {
                    home: { type: 'dir', name: 'home', children: {
                        user: { type: 'dir', name: 'user', children: {} }
                    }},
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
            const parts = Array.isArray(path) ? path.slice() : this.normalizePath(path);
            if (!parts.length) return null;
            const name = parts.pop();
            return { parent: this.nodeAt(parts), name, parts };
        }

        fsMkdir(args) {
            const target = this.parentAt(this.str(args.PATH, '/'));
            if (!target || !target.parent || target.parent.type !== 'dir') {
                this.syscallResult = 'ENOENT';
                return;
            }
            if (target.parent.children[target.name]) {
                this.syscallResult = 'EEXIST';
                return;
            }
            target.parent.children[target.name] = { type: 'dir', name: target.name, children: {} };
            this.memoryUsed += 64;
            this.syscallResult = '0';
        }

        fsWrite(args) {
            const target = this.parentAt(this.str(args.PATH, '/'));
            if (!target || !target.parent || target.parent.type !== 'dir') {
                this.syscallResult = 'ENOENT';
                return;
            }
            if (target.parent.children[target.name] && target.parent.children[target.name].type === 'dir') {
                this.syscallResult = 'EISDIR';
                return;
            }
            const text = this.str(args.TEXT, '');
            const old = target.parent.children[target.name];
            const oldSize = old && old.type === 'file' ? old.content.length : 0;
            target.parent.children[target.name] = { type: 'file', name: target.name, content: text, size: text.length };
            this.memoryUsed = Math.max(4 * 1024 * 1024, this.memoryUsed - oldSize + text.length);
            this.memoryUsed = Math.min(this.memoryTotal, this.memoryUsed);
            this.syscallResult = String(text.length);
        }

        fsDelete(args) {
            const target = this.parentAt(this.str(args.PATH, '/'));
            if (!target || !target.parent || !target.parent.children[target.name]) {
                this.syscallResult = 'ENOENT';
                return;
            }
            delete target.parent.children[target.name];
            this.syscallResult = '0';
        }

        fsRead(args) {
            const node = this.nodeAt(this.str(args.PATH, '/'));
            if (!node) return '';
            return node.type === 'file' ? node.content : '';
        }

        fsList(args) {
            const node = this.nodeAt(this.str(args.PATH, '/'));
            if (!node || node.type !== 'dir') return '';
            return Object.keys(node.children).sort().map(name => {
                return node.children[name].type === 'dir' ? name + '/' : name;
            }).join('  ');
        }

        fsExists(args) {
            return !!this.nodeAt(this.str(args.PATH, '/'));
        }

        syscall(args) {
            const name = this.str(args.NAME).trim().toLowerCase();
            const arg1 = this.str(args.ARG1);
            const arg2 = this.str(args.ARG2);
            this.lastSyscall = name;

            switch (name) {
                case 'mkdir':
                    this.fsMkdir({ PATH: arg1 });
                    break;
                case 'write':
                    this.fsWrite({ PATH: arg1, TEXT: arg2 });
                    break;
                case 'read':
                    this.syscallResult = this.fsRead({ PATH: arg1 });
                    break;
                case 'delete':
                case 'unlink':
                    this.fsDelete({ PATH: arg1 });
                    break;
                case 'list':
                    this.syscallResult = this.fsList({ PATH: arg1 });
                    break;
                case 'exists':
                    this.syscallResult = this.fsExists({ PATH: arg1 }) ? '1' : '0';
                    break;
                case 'open':
                    this.syscallResult = String(this.openFile(arg1));
                    break;
                case 'close':
                    this.syscallResult = this.closeFile(this.int(arg1, -1)) ? '0' : 'EBADF';
                    break;
                default:
                    this.syscallResult = 'ENOSYS';
                    break;
            }
        }

        openFile(path) {
            if (!this.nodeAt(path)) this.fsWrite({ PATH: path, TEXT: '' });
            if (!this.nodeAt(path)) return -1;
            const fd = this.nextFd++;
            this.openFiles.set(fd, this.str(path));
            return fd;
        }

        closeFile(fd) {
            return this.openFiles.delete(fd);
        }

        registerDevices() {
            const devices = {
                cpu: 'online',
                memory: 'online',
                display: 'online',
                keyboard: 'online',
                mouse: 'online',
                timer: 'online',
                storage: 'online',
                nic: 'offline'
            };
            for (const [name, status] of Object.entries(devices)) {
                this.devices.set(name, { connected: status === 'online', status });
            }
        }

        installStyles() {
            if (document.getElementById('turboos-stage-style')) return;
            const style = document.createElement('style');
            style.id = 'turboos-stage-style';
            style.textContent = `
                #turboos-stage-overlay { position:absolute; pointer-events:none; z-index:20; overflow:hidden; }
                #turboos-stage-overlay canvas { display:block; width:100%; height:100%; }
            `;
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
            const rect = this.stageCanvas.getBoundingClientRect();
            const parentRect = this.stageCanvas.parentElement.getBoundingClientRect();
            this.overlay.style.left = `${rect.left - parentRect.left}px`;
            this.overlay.style.top = `${rect.top - parentRect.top}px`;
            this.overlay.style.width = `${rect.width}px`;
            this.overlay.style.height = `${rect.height}px`;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
            this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
            this.ctx.setTransform(
                (rect.width * dpr) / this.stageWidth,
                0,
                0,
                (rect.height * dpr) / this.stageHeight,
                (rect.width * dpr) / 2,
                (rect.height * dpr) / 2
            );
            this.render();
        }

        installInputManager() {
            if (this.inputInstalled) return;
            this.inputInstalled = true;
            window.addEventListener('keydown', event => {
                this.keysDown.add(event.key);
                this.lastKey = event.key;
                this.enqueueInterrupt(33, { type: 'keyboard', action: 'down', key: event.key, code: event.code });
            });
            window.addEventListener('keyup', event => {
                this.keysDown.delete(event.key);
                this.enqueueInterrupt(33, { type: 'keyboard', action: 'up', key: event.key, code: event.code });
            });
            const updatePointer = event => {
                if (!this.stageCanvas) return;
                const rect = this.stageCanvas.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                this.mouseX = ((event.clientX - rect.left) / rect.width) * this.stageWidth - this.stageWidth / 2;
                this.mouseY = this.stageHeight / 2 - ((event.clientY - rect.top) / rect.height) * this.stageHeight;
            };
            window.addEventListener('pointermove', updatePointer);
            window.addEventListener('pointerdown', event => {
                updatePointer(event);
                this.enqueueInterrupt(34, { type: 'mouse', action: 'down', button: event.button, x: this.mouseX, y: this.mouseY });
            });
            window.addEventListener('pointerup', event => {
                updatePointer(event);
                this.enqueueInterrupt(34, { type: 'mouse', action: 'up', button: event.button, x: this.mouseX, y: this.mouseY });
            });
        }

        enqueueInterrupt(irq, data = {}) {
            this.pendingInterrupts.push({ irq: this.int(irq, 32), frame: this.frame, data });
            if (this.pendingInterrupts.length > 128) {
                this.pendingInterrupts.splice(0, this.pendingInterrupts.length - 128);
            }
        }

        handleInterrupts() {
            const limit = Math.min(8, this.pendingInterrupts.length);
            for (let i = 0; i < limit; i++) {
                const item = this.pendingInterrupts.shift();
                this.handledInterrupts += 1;
                if (item.irq === 32) {
                    this.cpuTicks += 1;
                } else if (item.irq === 33 && item.data.action === 'down') {
                    this.cpuTicks += 1;
                }
            }
        }

        timerStep() {
            this.timerTicks += 1;
            this.enqueueInterrupt(32, { type: 'timer', tick: this.timerTicks });
        }

        scheduleProcess() {
            if (!this.processes.length) {
                this.currentPid = 0;
                return;
            }
            for (const process of this.processes) process.state = 'ready';
            this.schedulerIndex = (this.schedulerIndex + 1) % this.processes.length;
            const process = this.processes[this.schedulerIndex];
            process.state = 'running';
            process.cpuTime += 1;
            this.currentPid = process.pid;
        }

        kernelTick() {
            this.cpuTicks += 1;
            this.timerStep();
            this.handleInterrupts();
            this.scheduleProcess();
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

        roundedRect(x, y, w, h, r) {
            const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
            this.ctx.beginPath();
            this.ctx.moveTo(x + radius, y);
            this.ctx.arcTo(x + w, y, x + w, y + h, radius);
            this.ctx.arcTo(x + w, y + h, x, y + h, radius);
            this.ctx.arcTo(x, y + h, x, y, radius);
            this.ctx.arcTo(x, y, x + w, y, radius);
            this.ctx.closePath();
        }

        text(value, x, y, size, color = '#fff', align = 'left') {
            this.ctx.fillStyle = color;
            this.ctx.font = `${size}px system-ui, sans-serif`;
            this.ctx.textAlign = align;
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(this.str(value), x, y);
        }

        render() {
            if (!this.ctx || !this.canvas || !this.overlay) {
                this.ensureOverlay();
                if (!this.ctx) return;
            }
            this.overlay.style.display = this.state === 'off' ? 'none' : 'block';
            if (this.state === 'off') {
                this.clear();
                return;
            }
            this.clear();
            this.ctx.fillStyle = this.background;
            this.ctx.fillRect(-240, -180, 480, 360);
            switch (this.state) {
                case 'boot': this.renderBoot(); break;
                case 'kernel': this.renderKernel(); break;
                case 'services': this.renderServices(); break;
                case 'desktop': this.renderDesktop(); break;
            }
        }

        renderBoot() {
            this.text('TurboOS', 0, -82, 42, '#fff', 'center');
            this.text('Firmware / Bootloader', 0, -48, 15, '#93c5fd', 'center');
            const checks = ['Virtual CPU', 'Virtual memory', 'Display device', 'Input device', 'Storage device', 'Network device'];
            const count = Math.min(checks.length, Math.floor(this.frame / 6) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${checks[i]}`, -150, -10 + i * 24, 13, '#cbd5e1');
            this.ctx.fillStyle = '#1e293b';
            this.ctx.fillRect(-150, 126, 300, 8);
            this.ctx.fillStyle = '#3b82f6';
            this.ctx.fillRect(-150, 126, 300 * Math.min(1, this.frame / 36), 8);
        }

        renderKernel() {
            this.text('TurboOS Kernel', 0, -80, 34, '#fff', 'center');
            this.text('Initializing kernel subsystems', 0, -48, 14, '#93c5fd', 'center');
            const systems = ['CPU scheduler', 'Memory manager', 'Interrupt manager', 'Input manager', 'Display driver', 'Storage driver', 'Network driver'];
            const count = Math.min(systems.length, Math.floor((this.frame - 36) / 5) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${systems[i]}`, -150, -14 + i * 24, 13, '#cbd5e1');
            this.text(`CPU: ${this.cpuTicks}`, 145, 92, 11, '#64748b', 'right');
            this.text(`MEM: ${(this.memoryUsed / 1024 / 1024).toFixed(2)} / 64 MB`, 145, 110, 11, '#64748b', 'right');
        }

        renderServices() {
            this.text('TurboOS', 0, -82, 38, '#fff', 'center');
            this.text('Starting system services', 0, -49, 15, '#93c5fd', 'center');
            const services = ['Process manager', 'Virtual filesystem', 'Network manager', 'Event dispatcher', 'Desktop shell'];
            const count = Math.min(services.length, Math.floor((this.frame - 67) / 5) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${services[i]}`, -140, -12 + i * 24, 13, '#cbd5e1');
        }

        renderDesktop() {
            const g = this.ctx.createLinearGradient(0, -180, 0, 180);
            g.addColorStop(0, '#182437');
            g.addColorStop(1, '#08101d');
            this.ctx.fillStyle = g;
            this.ctx.fillRect(-240, -180, 480, 360);
            this.ctx.fillStyle = 'rgba(10,15,24,.94)';
            this.ctx.fillRect(-240, -180, 480, 28);
            this.text('TurboOS', -220, -166, 13, '#f8fafc');
            this.text('Network: ' + this.networkStatus, 85, -166, 11, this.networkStatus === 'online' ? '#60a5fa' : '#94a3b8');
            this.text('frame ' + this.frame, 220, -166, 11, '#64748b', 'right');

            this.desktopIcon(-180, -90, '▣', 'System');
            this.desktopIcon(-100, -90, '□', 'Files');
            this.desktopIcon(-20, -90, '›_', 'Terminal');
            this.desktopIcon(60, -90, '◎', 'Network');

            this.ctx.fillStyle = 'rgba(15,23,42,.84)';
            this.roundedRect(-150, -25, 300, 135, 14);
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(148,163,184,.18)';
            this.ctx.stroke();
            this.text('Welcome to TurboOS', 0, 5, 22, '#f8fafc', 'center');
            this.text('Stage-based virtual operating system', 0, 36, 13, '#94a3b8', 'center');
            this.text(`${this.processes.length} process${this.processes.length === 1 ? '' : 'es'} · ${this.fsList({PATH:'/'})}`, 0, 66, 11, '#60a5fa', 'center');

            this.ctx.fillStyle = 'rgba(10,15,24,.96)';
            this.ctx.fillRect(-240, 146, 480, 34);
            this.text('◈', -220, 163, 16, '#60a5fa', 'center');
            this.text('TurboOS', -185, 163, 12, '#e2e8f0');
            this.text('PID ' + this.currentPid + '  ·  CPU ' + this.cpuTicks, 220, 163, 11, '#94a3b8', 'right');
        }

        desktopIcon(x, y, icon, label) {
            this.ctx.fillStyle = 'rgba(255,255,255,.06)';
            this.roundedRect(x - 26, y - 25, 52, 52, 8);
            this.ctx.fill();
            this.text(icon, x, y - 2, 23, '#93c5fd', 'center');
            this.text(label, x, y + 45, 11, '#e2e8f0', 'center');
        }

        startOS() {
            if (this.running) return;
            this.running = true;
            this.state = 'boot';
            this.frame = 0;
            this.cpuTicks = 0;
            this.timerTicks = 0;
            this.handledInterrupts = 0;
            this.pendingInterrupts.length = 0;
            this.background = '#020617';
            this.ensureOverlay();
            this.render();
        }

        stepFrame() {
            if (!this.running) return;
            this.frame += 1;
            this.kernelTick();
            if (this.frame < 36) this.state = 'boot';
            else if (this.frame < 68) this.state = 'kernel';
            else if (this.frame < 96) this.state = 'services';
            else { this.state = 'desktop'; this.background = '#101827'; }
            this.render();
        }

        stepFrames(args) {
            const count = this.clampCount(args.COUNT);
            for (let i = 0; i < count; i++) this.stepFrame();
        }

        restart() { this.shutdown(); this.startOS(); }

        shutdown() {
            this.running = false;
            this.state = 'off';
            this.frame = 0;
            this.currentPid = 0;
            this.render();
        }

        spawnProcess(args) {
            const name = this.str(args.NAME, 'app').trim() || 'app';
            const pid = this.nextPid++;
            this.processes.push({ pid, name, state: 'ready', cpuTime: 0 });
            this.memoryUsed = Math.min(this.memoryTotal, this.memoryUsed + 4096);
            this.kernelResponse = `spawned ${name} (pid=${pid})`;
            return pid;
        }

        killProcess(args) {
            const pid = this.int(args.PID, -1);
            const index = this.processes.findIndex(p => p.pid === pid);
            if (index < 0) {
                this.kernelResponse = `PID ${pid}: not found`;
                return;
            }
            this.processes.splice(index, 1);
            this.currentPid = this.processes.length ? this.processes[0].pid : 0;
            this.memoryUsed = Math.max(4 * 1024 * 1024, this.memoryUsed - 4096);
            this.kernelResponse = `killed pid=${pid}`;
        }

        raiseInterrupt(args) {
            this.enqueueInterrupt(args.IRQ, { type: 'software' });
        }

        sendKernelCommand(args) {
            const command = this.str(args.COMMAND).trim();
            switch (command.toLowerCase()) {
                case 'ping': this.kernelResponse = 'pong'; break;
                case 'sync': this.handleInterrupts(); this.kernelResponse = 'interrupts synchronized'; break;
                case 'uptime': this.kernelResponse = String(this.frame); break;
                case 'ps': this.kernelResponse = this.processes.map(p => `${p.pid}:${p.name}:${p.state}`).join('\n') || 'No processes'; break;
                default: this.kernelResponse = `unknown kernel command: ${command}`;
            }
        }

        networkConnect() {
            const nic = this.devices.get('nic');
            if (nic) { nic.connected = true; nic.status = 'online'; }
            this.networkStatus = 'online';
            this.networkLastError = '';
            this.kernelResponse = 'nic0: connected';
        }

        networkDisconnect() {
            const nic = this.devices.get('nic');
            if (nic) { nic.connected = false; nic.status = 'offline'; }
            this.networkStatus = 'offline';
            this.kernelResponse = 'nic0: disconnected';
        }

        async networkGet(args) {
            const url = this.str(args.URL).trim();
            if (!url) {
                this.networkLastError = 'EURL: empty URL';
                return;
            }
            if (this.networkStatus !== 'online') this.networkConnect();

            this.networkBusy = true;
            this.networkLastURL = url;
            this.networkLastStatus = 0;
            this.networkLastText = '';
            this.networkLastError = '';
            this.enqueueInterrupt(40, { type: 'network', action: 'request', url });

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit'
                });
                this.networkLastStatus = response.status;
                this.networkLastText = await response.text();
                this.kernelResponse = `HTTP ${response.status}`;
                this.enqueueInterrupt(40, { type: 'network', action: 'response', status: response.status, url });
            } catch (error) {
                this.networkLastError = `ENET: ${error && error.message ? error.message : String(error)}`;
                this.kernelResponse = 'network request failed';
                this.enqueueInterrupt(40, { type: 'network', action: 'error', url });
            } finally {
                this.networkBusy = false;
            }
        }

        // Reporters
        osState() { return this.state; }
        osFrame() { return this.frame; }
        cpuTicksReporter() { return this.cpuTicks; }
        timerTicksReporter() { return this.timerTicks; }
        memoryUsedReporter() { return this.memoryUsed / 1024 / 1024; }
        memoryTotalReporter() { return this.memoryTotal / 1024 / 1024; }
        processCountReporter() { return this.processes.length; }
        currentPidReporter() { return this.currentPid; }
        pendingInterruptsReporter() { return this.pendingInterrupts.length; }
        handledInterruptsReporter() { return this.handledInterrupts; }
        lastKeyReporter() { return this.lastKey; }
        keyDownReporter(args) { return this.keysDown.has(this.str(args.KEY)); }
        mouseXReporter() { return this.mouseX; }
        mouseYReporter() { return this.mouseY; }
        deviceStatus(args) {
            const name = this.str(args.DEVICE).trim().toLowerCase();
            const device = this.devices.get(name);
            return device ? device.status : 'unknown';
        }
        kernelResponse() { return this.kernelResponse; }
        syscallResult() { return this.syscallResult; }
        networkStatusReporter() { return this.networkStatus; }
        networkHTTPStatus() { return this.networkLastStatus; }
        networkResponse() { return this.networkLastText; }
        networkError() { return this.networkLastError; }
        networkBusyReporter() { return this.networkBusy; }
        isRunning() { return this.running; }
    }

    Scratch.extensions.register(new TurboOS());
})(Scratch);
