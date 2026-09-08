(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('TurboLinux must run unsandboxed.');
    }

    class TurboLinux {
        constructor() {
            this.root = {
                type: 'dir',
                children: {
                    home: {
                        type: 'dir',
                        children: {
                            user: {
                                type: 'dir',
                                children: {}
                            }
                        }
                    },
                    tmp: {
                        type: 'dir',
                        children: {}
                    },
                    etc: {
                        type: 'dir',
                        children: {}
                    },
                    bin: {
                        type: 'dir',
                        children: {}
                    }
                }
            };

            this.cwd = ['home', 'user'];
            this.running = false;
            this.terminal = null;
            this.output = null;
            this.input = null;
            this.prompt = null;

            this.bootScreen = null;
            this.desktop = null;

            this.hostname = 'turbolinux';
            this.username = 'user';

            this.makeStyles();
        }

        getInfo() {
            return {
                id: 'turbolinux',
                name: 'TurboLinux',

                color1: '#202020',
                color2: '#303030',
                color3: '#111111',

                blocks: [

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'startOS',
                        text: 'TurboLinux を起動'
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'shutdown',
                        text: 'TurboLinux をシャットダウン'
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'restart',
                        text: 'TurboLinux を再起動'
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'openTerminal',
                        text: 'ターミナルを開く'
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'runCommand',
                        text: 'Linuxコマンド [CMD] を実行',
                        arguments: {
                            CMD: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'ls'
                            }
                        }
                    },

                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'commandOutput',
                        text: '最後のコマンド出力'
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'writeFile',
                        text: 'ファイル [PATH] に [TEXT] を書く',
                        arguments: {
                            PATH: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '/home/user/test.txt'
                            },
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Hello Linux!'
                            }
                        }
                    },

                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'readFile',
                        text: 'ファイル [PATH] を読む',
                        arguments: {
                            PATH: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '/home/user/test.txt'
                            }
                        }
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'mkdir',
                        text: 'ディレクトリ [PATH] を作る',
                        arguments: {
                            PATH: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '/home/user/test'
                            }
                        }
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'deletePath',
                        text: '[PATH] を削除',
                        arguments: {
                            PATH: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '/home/user/test.txt'
                            }
                        }
                    },

                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'setWallpaper',
                        text: '壁紙を [COLOR] にする',
                        arguments: {
                            COLOR: {
                                type: Scratch.ArgumentType.COLOR,
                                defaultValue: '#202020'
                            }
                        }
                    },

                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'currentDirectory',
                        text: '現在のディレクトリ'
                    },

                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'systemInfo',
                        text: 'システム情報'
                    },

                    {
                        blockType: Scratch.BlockType.BOOLEAN,
                        opcode: 'isRunning',
                        text: 'TurboLinux は起動中？'
                    }
                ]
            };
        }

        makeStyles() {
            if (document.getElementById('turbolinux-style')) return;

            const style = document.createElement('style');
            style.id = 'turbolinux-style';

            style.textContent = `
                #turbolinux {
                    position: fixed;
                    inset: 0;
                    z-index: 999999;
                    background: #202020;
                    color: white;
                    font-family:
                        system-ui,
                        -apple-system,
                        BlinkMacSystemFont,
                        "Segoe UI",
                        sans-serif;
                    display: none;
                    overflow: hidden;
                }

                #turbolinux-boot {
                    position: absolute;
                    inset: 0;
                    background: #000;
                    color: #ddd;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    font-family: monospace;
                }

                #turbolinux-logo {
                    font-size: 42px;
                    font-weight: bold;
                    margin-bottom: 30px;
                }

                #turbolinux-boot-text {
                    font-size: 15px;
                    white-space: pre;
                }

                #turbolinux-desktop {
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(
                            circle at 50% 30%,
                            #384b60,
                            #10151b 70%
                        );
                }

                #turbolinux-panel {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 42px;
                    background: rgba(20,20,20,.92);
                    display: flex;
                    align-items: center;
                    padding: 0 12px;
                    box-sizing: border-box;
                    gap: 12px;
                    user-select: none;
                }

                #turbolinux-menu {
                    background: #303030;
                    border: 1px solid #555;
                    padding: 7px 13px;
                    border-radius: 5px;
                    cursor: pointer;
                }

                #turbolinux-clock {
                    margin-left: auto;
                    font-family: monospace;
                }

                .turbolinux-window {
                    position: absolute;
                    left: 12%;
                    top: 12%;
                    width: 70%;
                    height: 65%;
                    min-width: 350px;
                    min-height: 250px;
                    background: #181818;
                    border: 1px solid #555;
                    border-radius: 8px;
                    box-shadow: 0 20px 60px rgba(0,0,0,.6);
                    overflow: hidden;
                }

                .turbolinux-titlebar {
                    height: 36px;
                    background: #292929;
                    display: flex;
                    align-items: center;
                    padding: 0 10px;
                    box-sizing: border-box;
                    user-select: none;
                }

                .turbolinux-title {
                    flex: 1;
                    font-size: 13px;
                }

                .turbolinux-close {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    border: 0;
                    background: #555;
                    color: white;
                    cursor: pointer;
                }

                #turbolinux-terminal {
                    height: calc(100% - 36px);
                    display: flex;
                    flex-direction: column;
                    background: #0b0b0b;
                }

                #turbolinux-output {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    box-sizing: border-box;
                    white-space: pre-wrap;
                    font-family: monospace;
                    font-size: 14px;
                }

                #turbolinux-input-row {
                    display: flex;
                    padding: 8px;
                    border-top: 1px solid #333;
                    font-family: monospace;
                }

                #turbolinux-prompt {
                    margin-right: 8px;
                    color: #7cff7c;
                }

                #turbolinux-input {
                    flex: 1;
                    background: transparent;
                    border: 0;
                    outline: 0;
                    color: white;
                    font-family: monospace;
                    font-size: 14px;
                }

                #turbolinux-power {
                    position: absolute;
                    right: 15px;
                    bottom: 15px;
                    background: rgba(0,0,0,.6);
                    border: 1px solid #555;
                    color: white;
                    border-radius: 6px;
                    padding: 8px 12px;
                    cursor: pointer;
                }

                .turbolinux-desktop-icon {
                    position: absolute;
                    width: 80px;
                    text-align: center;
                    padding: 10px;
                    cursor: pointer;
                    user-select: none;
                }

                .turbolinux-desktop-icon:hover {
                    background: rgba(255,255,255,.08);
                    border-radius: 8px;
                }

                .turbolinux-icon-symbol {
                    font-size: 34px;
                }

                .turbolinux-icon-name {
                    font-size: 12px;
                    margin-top: 5px;
                }
            `;

            document.head.appendChild(style);
        }

        createOS() {
            if (document.getElementById('turbolinux')) {
                return;
            }

            const os = document.createElement('div');
            os.id = 'turbolinux';

            os.innerHTML = `
                <div id="turbolinux-boot">
                    <div id="turbolinux-logo">TurboLinux</div>
                    <div id="turbolinux-boot-text">
Starting TurboLinux...

[ OK ] Initializing virtual kernel
[ OK ] Mounting virtual filesystem
[ OK ] Starting userspace
[ OK ] Starting desktop environment

                    </div>
                </div>

                <div id="turbolinux-desktop">

                    <div id="turbolinux-panel">
                        <div id="turbolinux-menu">☰ TurboLinux</div>
                        <div id="turbolinux-clock"></div>
                    </div>

                    <div
                        class="turbolinux-desktop-icon"
                        style="left:20px;top:65px"
                        id="turbolinux-terminal-icon"
                    >
                        <div class="turbolinux-icon-symbol">💻</div>
                        <div class="turbolinux-icon-name">
                            Terminal
                        </div>
                    </div>

                    <div
                        class="turbolinux-desktop-icon"
                        style="left:20px;top:160px"
                        id="turbolinux-files-icon"
                    >
                        <div class="turbolinux-icon-symbol">📁</div>
                        <div class="turbolinux-icon-name">
                            Files
                        </div>
                    </div>

                    <button id="turbolinux-power">
                        ⏻
                    </button>

                </div>
            `;

            document.body.appendChild(os);

            this.bootScreen =
                document.getElementById('turbolinux-boot');

            this.desktop =
                document.getElementById('turbolinux-desktop');

            document
                .getElementById('turbolinux-terminal-icon')
                .onclick = () => this.openTerminal();

            document
                .getElementById('turbolinux-menu')
                .onclick = () => this.openTerminal();

            document
                .getElementById('turbolinux-power')
                .onclick = () => this.shutdown();

            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
        }

        updateClock() {
            const clock =
                document.getElementById('turbolinux-clock');

            if (clock) {
                clock.textContent =
                    new Date().toLocaleTimeString();
            }
        }

        startOS() {
            this.createOS();

            const os =
                document.getElementById('turbolinux');

            os.style.display = 'block';

            this.running = true;

            this.bootScreen.style.display = 'flex';
            this.desktop.style.display = 'none';

            setTimeout(() => {
                this.bootScreen.style.display = 'none';
                this.desktop.style.display = 'block';
                this.openTerminal();
            }, 1500);
        }

        shutdown() {
            this.running = false;

            const os =
                document.getElementById('turbolinux');

            if (!os) return;

            os.style.display = 'none';

            if (this.terminal) {
                this.terminal.remove();
                this.terminal = null;
            }
        }

        restart() {
            this.shutdown();

            setTimeout(() => {
                this.startOS();
            }, 300);
        }

        openTerminal() {
            if (!this.running) return;

            if (this.terminal) {
                this.terminal.style.display = 'block';

                if (this.input) {
                    this.input.focus();
                }

                return;
            }

            const win =
                document.createElement('div');

            win.className =
                'turbolinux-window';

            win.innerHTML = `
                <div class="turbolinux-titlebar">
                    <div class="turbolinux-title">
                        user@turbolinux: ~
                    </div>

                    <button class="turbolinux-close">
                        ×
                    </button>
                </div>

                <div id="turbolinux-terminal">

                    <div id="turbolinux-output"></div>

                    <div id="turbolinux-input-row">

                        <span id="turbolinux-prompt">
                            user@turbolinux:~$
                        </span>

                        <input
                            id="turbolinux-input"
                            autocomplete="off"
                            spellcheck="false"
                        />

                    </div>
                </div>
            `;

            document.body.appendChild(win);

            this.terminal = win;

            this.output =
                win.querySelector('#turbolinux-output');

            this.input =
                win.querySelector('#turbolinux-input');

            this.prompt =
                win.querySelector('#turbolinux-prompt');

            win
                .querySelector('.turbolinux-close')
                .onclick = () => {
                    win.style.display = 'none';
                };

            this.input.addEventListener(
                'keydown',
                e => {
                    if (e.key === 'Enter') {

                        const command =
                            this.input.value;

                        this.input.value = '';

                        this.print(
                            this.prompt.textContent +
                            ' ' +
                            command
                        );

                        const result =
                            this.execute(command);

                        if (result !== '') {
                            this.print(result);
                        }

                        this.updatePrompt();
                    }
                }
            );

            this.print(
                'TurboLinux Terminal\n' +
                'Type "help" for available commands.\n'
            );

            this.updatePrompt();

            this.input.focus();
        }

        print(text) {
            if (!this.output) return;

            this.output.textContent +=
                String(text) + '\n';

            this.output.scrollTop =
                this.output.scrollHeight;
        }

        updatePrompt() {
            if (!this.prompt) return;

            this.prompt.textContent =
                `${this.username}@${this.hostname}:${this.currentDirectory()}$`;
        }

        normalizePath(path) {
            if (!path) {
                return [...this.cwd];
            }

            let parts;

            if (path.startsWith('/')) {
                parts = [];
            } else {
                parts = [...this.cwd];
            }

            for (const part of path.split('/')) {

                if (!part || part === '.') continue;

                if (part === '..') {
                    parts.pop();
                } else {
                    parts.push(part);
                }
            }

            return parts;
        }

        getNode(pathParts) {
            let node = this.root;

            for (const part of pathParts) {
                if (
                    node.type !== 'dir' ||
                    !node.children[part]
                ) {
                    return null;
                }

                node = node.children[part];
            }

            return node;
        }

        parentNode(pathParts) {
            if (pathParts.length === 0) {
                return null;
            }

            return this.getNode(
                pathParts.slice(0, -1)
            );
        }

        currentDirectory() {
            return '/' + this.cwd.join('/');
        }

        execute(command) {

            command = command.trim();

            if (!command) {
                return '';
            }

            const args =
                command.match(/(?:[^\s"]+|"[^"]*")+/g)
                || [];

            const cmd =
                args.shift();

            const cleanArgs =
                args.map(x =>
                    x.replace(/^"|"$/g, '')
                );

            switch (cmd) {

                case 'help':
                    return [
                        'TurboLinux commands:',
                        '',
                        'ls',
                        'cd <dir>',
                        'pwd',
                        'mkdir <dir>',
                        'touch <file>',
                        'cat <file>',
                        'echo <text>',
                        'rm <file>',
                        'clear',
                        'uname',
                        'whoami',
                        'date',
                        'neofetch',
                        'shutdown',
                        'reboot',
                        'help'
                    ].join('\n');

                case 'pwd':
                    return this.currentDirectory();

                case 'ls': {
                    const node =
                        this.getNode(this.cwd);

                    if (!node || node.type !== 'dir') {
                        return 'ls: not a directory';
                    }

                    return Object.keys(node.children)
                        .map(name => {
                            const child =
                                node.children[name];

                            return child.type === 'dir'
                                ? name + '/'
                                : name;
                        })
                        .join('  ');
                }

                case 'cd': {

                    const target =
                        cleanArgs[0] || '/home/user';

                    const path =
                        this.normalizePath(target);

                    const node =
                        this.getNode(path);

                    if (!node) {
                        return `cd: ${target}: No such file or directory`;
                    }

                    if (node.type !== 'dir') {
                        return `cd: ${target}: Not a directory`;
                    }

                    this.cwd = path;

                    return '';
                }

                case 'mkdir': {

                    if (!cleanArgs[0]) {
                        return 'mkdir: missing operand';
                    }

                    const path =
                        this.normalizePath(cleanArgs[0]);

                    const name =
                        path.pop();

                    const parent =
                        this.getNode(path);

                    if (!parent ||
                        parent.type !== 'dir') {
                        return 'mkdir: parent does not exist';
                    }

                    if (parent.children[name]) {
                        return 'mkdir: already exists';
                    }

                    parent.children[name] = {
                        type: 'dir',
                        children: {}
                    };

                    return '';
                }

                case 'touch': {

                    if (!cleanArgs[0]) {
                        return 'touch: missing operand';
                    }

                    const path =
                        this.normalizePath(cleanArgs[0]);

                    const name =
                        path.pop();

                    const parent =
                        this.getNode(path);

                    if (!parent ||
                        parent.type !== 'dir') {
                        return 'touch: parent does not exist';
                    }

                    if (!parent.children[name]) {
                        parent.children[name] = {
                            type: 'file',
                            content: ''
                        };
                    }

                    return '';
                }

                case 'cat': {

                    if (!cleanArgs[0]) {
                        return 'cat: missing operand';
                    }

                    const node =
                        this.getNode(
                            this.normalizePath(cleanArgs[0])
                        );

                    if (!node) {
                        return 'cat: No such file or directory';
                    }

                    if (node.type !== 'file') {
                        return 'cat: Is a directory';
                    }

                    return node.content;
                }

                case 'echo':
                    return cleanArgs.join(' ');

                case 'rm': {

                    if (!cleanArgs[0]) {
                        return 'rm: missing operand';
                    }

                    const path =
                        this.normalizePath(cleanArgs[0]);

                    const name =
                        path.pop();

                    const parent =
                        this.getNode(path);

                    if (!parent ||
                        !parent.children[name]) {
                        return 'rm: No such file or directory';
                    }

                    delete parent.children[name];

                    return '';
                }

                case 'clear':
                    if (this.output) {
                        this.output.textContent = '';
                    }
                    return '';

                case 'uname':
                    return 'TurboLinux 1.0 virtual-kernel x86_64';

                case 'whoami':
                    return this.username;

                case 'date':
                    return new Date().toString();

                case 'neofetch':
                    return `
        .--------.
       / Turbo   /|
      / Linux   / |
     /_________/  |
     |         |  |
     |  TUX    | /
     |_________|/

OS: TurboLinux
Kernel: Virtual Kernel 1.0
Shell: turbo-shell
User: ${this.username}
Host: ${this.hostname}
PWD: ${this.currentDirectory()}
`;

                case 'shutdown':
                    this.shutdown();
                    return '';

                case 'reboot':
                    this.restart();
                    return '';

                default:
                    return `${cmd}: command not found`;
            }
        }

        runCommand(args) {
            this.lastOutput =
                this.execute(String(args.CMD || ''));

            return this.lastOutput;
        }

        commandOutput() {
            return this.lastOutput || '';
        }

        writeFile(args) {

            const path =
                this.normalizePath(
                    String(args.PATH || '')
                );

            const name =
                path.pop();

            const parent =
                this.getNode(path);

            if (!parent ||
                parent.type !== 'dir') {
                return;
            }

            parent.children[name] = {
                type: 'file',
                content: String(args.TEXT || '')
            };
        }

        readFile(args) {

            const node =
                this.getNode(
                    this.normalizePath(
                        String(args.PATH || '')
                    )
                );

            if (!node ||
                node.type !== 'file') {
                return '';
            }

            return node.content;
        }

        mkdir(args) {
            this.execute(
                `mkdir "${String(args.PATH || '')}"`
            );
        }

        deletePath(args) {
            this.execute(
                `rm "${String(args.PATH || '')}"`
            );
        }

        setWallpaper(args) {

            const desktop =
                document.getElementById(
                    'turbolinux-desktop'
                );

            if (!desktop) return;

            desktop.style.background =
                args.COLOR || '#202020';
        }

        systemInfo() {
            return [
                'TurboLinux',
                'Version: 1.0',
                'Kernel: Virtual Kernel',
                'Architecture: x86_64',
                'Shell: turbo-shell',
                'Filesystem: TurboFS',
                'Hostname: ' + this.hostname,
                'User: ' + this.username
            ].join('\n');
        }

        isRunning() {
            return this.running;
        }
    }

    Scratch.extensions.register(
        new TurboLinux()
    );

})(Scratch);
