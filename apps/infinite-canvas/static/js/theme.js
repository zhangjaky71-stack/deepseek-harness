(function(){
    const KEY = 'studio_theme';
    const LEGACY_KEY = 'canvas_theme';
    const SCALE_KEY = 'studio_ui_scale_mode';
    const SCALE_OPTIONS = ['auto', '60', '65', '70', '75', '80', '85', '90', '95', '100', '115', '125', '140'];
    const HARNESS_BRIDGE_CHANNEL = 'deepseek-harness:infinite-canvas';
    const HARNESS_BRIDGE_VERSION = 1;
    let harnessHostOrigin = '';
    const harnessCanvasCommandResults = new Map();
    const pendingHarnessCanvasCommands = [];

    function currentTheme(){
        return localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || 'light';
    }

    function applyTheme(theme){
        const next = theme === 'dark' ? 'dark' : 'light';
        const dark = next === 'dark';
        document.documentElement.classList.toggle('studio-theme-dark', dark);
        document.documentElement.classList.toggle('theme-dark', dark);
        if(document.body){
            document.body.classList.toggle('studio-theme-dark', dark);
            document.body.classList.toggle('theme-dark', dark);
        }
        window.dispatchEvent(new CustomEvent('studio-theme-change', { detail: { theme: next } }));
    }

    function ensureScaleStyle(){
        if(document.getElementById('studio-scale-style')) return;
        const style = document.createElement('style');
        style.id = 'studio-scale-style';
        style.textContent = `
            html.studio-scale-managed {
                --studio-ui-scale: 1;
            }
            html.studio-ui-scaled,
            html.studio-ui-scaled body {
                overscroll-behavior-x: none;
            }
            html.studio-ui-scaled {
                overflow-x: hidden !important;
            }
            html.studio-ui-scaled::-webkit-scrollbar:horizontal,
            html.studio-ui-scaled body::-webkit-scrollbar:horizontal {
                height: 0 !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) {
                width: calc(100% / var(--studio-ui-scale)) !important;
                min-height: calc(100vh / var(--studio-ui-scale)) !important;
                transform: scale(var(--studio-ui-scale));
                transform-origin: 0 0;
            }
            html.studio-ui-scaled body.studio-scale-viewport:not(.studio-scale-host) {
                height: calc(100vh / var(--studio-ui-scale)) !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) > .app-shell,
            html.studio-ui-scaled body:not(.studio-scale-host) > .shell,
            html.studio-ui-scaled body:not(.studio-scale-host) > .asset-page {
                width: 100% !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) > .app-shell,
            html.studio-ui-scaled body:not(.studio-scale-host) > .shell {
                height: calc(100vh / var(--studio-ui-scale)) !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) > .asset-page {
                min-height: calc(100vh / var(--studio-ui-scale)) !important;
            }
        `;
        document.head.appendChild(style);
    }

    function isFramed(){
        try {
            return window.self !== window.top;
        } catch(e) {
            return true;
        }
    }

    function isHarnessEnvelope(data, type){
        return data && typeof data === 'object'
            && data.channel === HARNESS_BRIDGE_CHANNEL
            && data.version === HARNESS_BRIDGE_VERSION
            && data.type === type;
    }

    function validHarnessGenerateCommand(command){
        if(!command || typeof command !== 'object') return false;
        if(typeof command.commandId !== 'string' || !command.commandId) return false;
        if(command.action !== 'generate') return false;
        if(typeof command.prompt !== 'string' || !command.prompt.trim()) return false;
        if(command.model !== undefined && typeof command.model !== 'string') return false;
        const target = command.target;
        return !!target && typeof target === 'object'
            && (target.kind === 'active'
                || (target.kind === 'node' && typeof target.nodeId === 'string' && !!target.nodeId));
    }

    function isHarnessHostInit(event){
        const data = event.data;
        return isFramed()
            && event.source === window.parent
            && event.origin !== location.origin
            && isHarnessEnvelope(data, 'host:init')
            && data.payload?.host === 'deepseek-harness';
    }

    function isHarnessHostCommand(event){
        return isFramed()
            && event.source === window.parent
            && event.origin !== location.origin
            && isHarnessEnvelope(event.data, 'host:command')
            && validHarnessGenerateCommand(event.data.payload?.command);
    }

    function isInnerHarnessCommand(event){
        return isFramed()
            && event.source === window.parent
            && event.origin === location.origin
            && location.pathname === '/static/canvas.html'
            && isHarnessEnvelope(event.data, 'host:command')
            && validHarnessGenerateCommand(event.data.payload?.command);
    }

    function replyHarnessReady(event){
        const target = event.source;
        if(!target || typeof target.postMessage !== 'function') return;
        const targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*';
        harnessHostOrigin = targetOrigin;
        target.postMessage({
            channel: HARNESS_BRIDGE_CHANNEL,
            version: HARNESS_BRIDGE_VERSION,
            type: 'canvas:ready',
            payload: { app: 'infinite-canvas' },
        }, targetOrigin);
    }

    function harnessCommandResultMessage(payload){
        return {
            channel: HARNESS_BRIDGE_CHANNEL,
            version: HARNESS_BRIDGE_VERSION,
            type: 'canvas:command-result',
            payload,
        };
    }

    function replyHarnessCommandResult(payload, fallbackOrigin=''){
        if(!isFramed() || !window.parent?.postMessage) return;
        const targetOrigin = harnessHostOrigin || fallbackOrigin || '*';
        window.parent.postMessage(harnessCommandResultMessage(payload), targetOrigin);
    }

    function replyInnerHarnessCommandResult(payload){
        if(!isFramed() || !window.parent?.postMessage) return;
        window.parent.postMessage(harnessCommandResultMessage(payload), location.origin);
    }

    function routeHarnessCommand(event){
        harnessHostOrigin = event.origin && event.origin !== 'null' ? event.origin : harnessHostOrigin;
        const commandId = String(event.data?.payload?.command?.commandId || '');
        const frame = document.getElementById('frame-canvas');
        if(!frame?.contentWindow){
            replyHarnessCommandResult({commandId, ok:false, error:'Infinite Canvas frame is unavailable.'}, event.origin);
            return;
        }
        let pathname = '';
        try { pathname = frame.contentWindow.location.pathname || ''; } catch(e) {}
        if(pathname !== '/static/canvas.html'){
            replyHarnessCommandResult({commandId, ok:false, error:'Open a classic canvas before sending an Agent Canvas command.'}, event.origin);
            return;
        }
        frame.contentWindow.postMessage(event.data, location.origin);
    }

    function relayHarnessCommandResult(event){
        const frame = document.getElementById('frame-canvas');
        if(!frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== location.origin) return false;
        if(!isHarnessEnvelope(event.data, 'canvas:command-result')) return false;
        replyHarnessCommandResult(event.data.payload);
        return true;
    }

    function harnessCanvasRuntimeReady(){
        return location.pathname === '/static/canvas.html'
            && typeof addPromptNode === 'function'
            && typeof addGeneratorNode === 'function'
            && typeof runCanvasGenerate === 'function'
            && typeof syncGeneratorInputs === 'function'
            && typeof scheduleSave === 'function'
            && typeof render === 'function'
            && typeof uid === 'function'
            && typeof nodes !== 'undefined'
            && typeof connections !== 'undefined';
    }

    function selectedHarnessGenerator(){
        if(typeof selected === 'undefined') return null;
        for(const id of selected){
            const node = nodes.find(item => item.id === id);
            if(node?.type === 'generator') return node;
        }
        return null;
    }

    function connectedPromptForHarnessGenerator(generator){
        const incoming = connections.filter(connection => connection.to === generator.id);
        for(const connection of incoming){
            const node = nodes.find(item => item.id === connection.from);
            if(node?.type === 'prompt') return node;
        }
        return null;
    }

    function ensureHarnessPrompt(generator, prompt){
        let promptNode = connectedPromptForHarnessGenerator(generator);
        if(!promptNode){
            promptNode = addPromptNode({x:generator.x - 340, y:generator.y});
            if(!promptNode) throw new Error('Canvas is not ready to create a prompt node.');
            connections.push({id:uid('c'), from:promptNode.id, to:generator.id});
        }
        promptNode.text = prompt;
        return promptNode;
    }

    function resolveHarnessGenerator(command){
        if(command.target.kind === 'node'){
            const node = nodes.find(item => item.id === command.target.nodeId);
            if(!node) throw new Error(`Canvas node ${command.target.nodeId} was not found.`);
            if(node.type !== 'generator') throw new Error('Phase 1 Agent generation targets an image generator node.');
            return node;
        }
        const active = selectedHarnessGenerator();
        if(active) return active;
        const point = typeof defaultPoint === 'function' ? defaultPoint(120, 0) : undefined;
        const created = addGeneratorNode(point);
        if(!created) throw new Error('Canvas is not ready to create an image generator node.');
        return created;
    }

    async function executeHarnessCanvasCommand(data){
        const command = data?.payload?.command;
        if(!validHarnessGenerateCommand(command)) return;
        const cached = harnessCanvasCommandResults.get(command.commandId);
        if(cached){
            replyInnerHarnessCommandResult(cached);
            return;
        }
        let result;
        try {
            if(!harnessCanvasRuntimeReady()) throw new Error('Classic Canvas workflow runtime is not ready.');
            const generator = resolveHarnessGenerator(command);
            if(generator.running) throw new Error('The target Canvas generator is already running.');
            ensureHarnessPrompt(generator, command.prompt.trim());
            if(command.model !== undefined && command.model.trim()) generator.model = command.model.trim();
            if(typeof selected !== 'undefined'){
                selected.clear();
                selected.add(generator.id);
            }
            syncGeneratorInputs();
            render();
            scheduleSave();
            await runCanvasGenerate(generator.id);
            if(generator.runStatus === 'failed') {
                throw new Error(generator.runError || 'Canvas generation failed.');
            }
            result = {commandId:command.commandId, ok:true, nodeId:generator.id};
        } catch(error) {
            result = {
                commandId:command.commandId,
                ok:false,
                error:error instanceof Error ? error.message : String(error),
            };
        }
        harnessCanvasCommandResults.set(command.commandId, result);
        replyInnerHarnessCommandResult(result);
    }

    function acceptInnerHarnessCommand(event){
        const data = event.data;
        if(document.readyState === 'loading' || !harnessCanvasRuntimeReady()){
            pendingHarnessCanvasCommands.push(data);
            return;
        }
        void executeHarnessCanvasCommand(data);
    }

    function flushPendingHarnessCanvasCommands(){
        if(!harnessCanvasRuntimeReady()){
            while(pendingHarnessCanvasCommands.length){
                const data = pendingHarnessCanvasCommands.shift();
                const commandId = String(data?.payload?.command?.commandId || '');
                replyInnerHarnessCommandResult({commandId, ok:false, error:'Classic Canvas workflow runtime did not become ready.'});
            }
            return;
        }
        while(pendingHarnessCanvasCommands.length){
            void executeHarnessCanvasCommand(pendingHarnessCanvasCommands.shift());
        }
    }

    function normalizeScaleMode(mode){
        return SCALE_OPTIONS.includes(mode) ? mode : 'auto';
    }

    function currentScaleMode(){
        try {
            return normalizeScaleMode(localStorage.getItem(SCALE_KEY) || 'auto');
        } catch(e) {
            return 'auto';
        }
    }

    function autoScale(){
        const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
        const viewportWidth = Math.max(320, Number(window.innerWidth || 0));
        const viewportHeight = Math.max(320, Number(window.innerHeight || 0));
        const compactRatio = Math.min(viewportWidth / 1500, viewportHeight / 940);
        if(compactRatio < 1) {
            return Math.max(0.68, Math.min(1, compactRatio));
        }
        const screenLong = Math.max(window.screen?.width || 0, window.screen?.height || 0);
        const viewportLong = Math.max(viewportWidth, viewportHeight);
        const longEdge = Math.max(screenLong, viewportLong);
        if(dpr >= 1.35) return 1;
        if(longEdge >= 3600) return 1.22;
        if(longEdge >= 3000) return 1.16;
        if(longEdge >= 2500 && dpr <= 1.15) return 1.1;
        return 1;
    }

    function scaleForMode(mode){
        const next = normalizeScaleMode(mode);
        if(next === 'auto' && Number.isFinite(externalScaleValue)) return externalScaleValue;
        if(next === 'auto') return autoScale();
        return Math.max(0.58, Math.min(1.4, Number(next) / 100));
    }

    let externalScaleValue = null;
    function normalizeExternalScale(value){
        const next = Number(value);
        return Number.isFinite(next) ? Math.max(0.58, Math.min(1.4, next)) : null;
    }

    function appliedScale(){
        const cssValue = Number(getComputedStyle(document.documentElement).getPropertyValue('--studio-ui-scale'));
        return Number.isFinite(cssValue) && cssValue > 0 ? cssValue : scaleForMode(currentScaleMode());
    }

    function updateScaleBodyClasses(){
        if(!document.body) return;
        const hasFrameHost = !!document.querySelector('.app-shell iframe, iframe.active');
        document.body.classList.toggle('studio-scale-host', hasFrameHost && !isFramed());
        const computed = window.getComputedStyle(document.body);
        const viewportLocked = computed.overflow === 'hidden' || computed.overflowY === 'hidden' || !!document.querySelector('.app-shell, .shell');
        document.body.classList.toggle('studio-scale-viewport', viewportLocked);
    }

    function scaleOptedOut(){
        return document.documentElement.dataset.studioScale === 'off';
    }

    function contentFitOptedOut(){
        return document.documentElement.dataset.studioFitScale === 'off';
    }

    let horizontalScrollLockPending = false;
    function lockScaledHorizontalScroll(){
        if(horizontalScrollLockPending || !document.documentElement.classList.contains('studio-ui-scaled')) return;
        if(Math.abs(window.scrollX || 0) < 1) return;
        horizontalScrollLockPending = true;
        requestAnimationFrame(() => {
            horizontalScrollLockPending = false;
            if(document.documentElement.classList.contains('studio-ui-scaled') && Math.abs(window.scrollX || 0) >= 1) {
                window.scrollTo(0, window.scrollY || 0);
            }
        });
    }

    let contentFitTimer = null;
    function scheduleContentFit(mode){
        clearTimeout(contentFitTimer);
        if(mode !== 'auto' || scaleOptedOut() || contentFitOptedOut() || Number.isFinite(externalScaleValue)) return;
        contentFitTimer = setTimeout(() => {
            const root = document.documentElement;
            if(!root.classList.contains('studio-ui-scaled')) return;
            const current = Number(getComputedStyle(root).getPropertyValue('--studio-ui-scale')) || 1;
            const viewportWidth = Math.max(320, Number(window.innerWidth || 0));
            const contentWidth = Math.max(
                viewportWidth,
                root.scrollWidth || 0,
                document.body?.scrollWidth || 0,
                document.body?.offsetWidth || 0
            );
            const fitted = Math.max(0.58, Math.min(current, viewportWidth / contentWidth));
            if(fitted < current - 0.006) {
                root.style.setProperty('--studio-ui-scale', fitted.toFixed(3));
                lockScaledHorizontalScroll();
            }
        }, 80);
    }

    function applyScale(mode){
        ensureScaleStyle();
        const next = normalizeScaleMode(mode);
        const optedOut = scaleOptedOut();
        const value = scaleForMode(next);
        const scaled = !optedOut && Math.abs(value - 1) > 0.01;
        document.documentElement.classList.add('studio-scale-managed');
        document.documentElement.classList.toggle('studio-ui-scaled', scaled);
        document.documentElement.style.setProperty('--studio-ui-scale', value.toFixed(3));
        updateScaleBodyClasses();
        lockScaledHorizontalScroll();
        scheduleContentFit(next);
        window.dispatchEvent(new CustomEvent('studio-ui-scale-change', { detail: { mode: next, scale: value } }));
    }

    function broadcastScale(mode){
        const scale = appliedScale();
        document.querySelectorAll('iframe').forEach(frame => {
            try {
                frame.contentWindow?.postMessage({ type: 'studio-ui-scale', mode, scale }, '*');
            } catch(e) {}
        });
    }

    function setScaleMode(mode, shouldBroadcast = true){
        const next = normalizeScaleMode(mode);
        try {
            localStorage.setItem(SCALE_KEY, next);
        } catch(e) {}
        applyScale(next);
        if(shouldBroadcast) broadcastScale(next);
    }

    let resizeTimer = null;
    let autoScalePausedUntil = 0;
    function pauseAutoScale(duration = 650){
        autoScalePausedUntil = Math.max(autoScalePausedUntil, Date.now() + Math.max(0, Number(duration) || 0));
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(scheduleAutoScaleRefresh, Math.max(0, autoScalePausedUntil - Date.now()) + 40);
    }

    function scheduleAutoScaleRefresh(){
        clearTimeout(resizeTimer);
        const wait = autoScalePausedUntil - Date.now();
        if(wait > 0) {
            resizeTimer = setTimeout(scheduleAutoScaleRefresh, wait + 40);
            return;
        }
        resizeTimer = setTimeout(() => {
            if(currentScaleMode() === 'auto') {
                applyScale('auto');
                broadcastScale('auto');
            }
        }, 160);
    }

    window.StudioTheme = {
        key: KEY,
        get: currentTheme,
        apply: applyTheme,
        set(theme){
            const next = theme === 'dark' ? 'dark' : 'light';
            localStorage.setItem(KEY, next);
            localStorage.setItem(LEGACY_KEY, next);
            applyTheme(next);
        }
    };

    window.StudioScale = {
        key: SCALE_KEY,
        options: SCALE_OPTIONS.slice(),
        getMode: currentScaleMode,
        getScale: () => scaleForMode(currentScaleMode()),
        apply: applyScale,
        set: setScaleMode
    };

    applyTheme(currentTheme());
    applyScale(currentScaleMode());

    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(currentTheme());
        applyScale(currentScaleMode());
        flushPendingHarnessCanvasCommands();
    });
    window.addEventListener('message', event => {
        if(isHarnessHostInit(event)) replyHarnessReady(event);
        if(isHarnessHostCommand(event)) routeHarnessCommand(event);
        if(isInnerHarnessCommand(event)) acceptInnerHarnessCommand(event);
        if(relayHarnessCommandResult(event)) return;
        if(event.data?.type === 'studio-theme') applyTheme(event.data.theme);
        if(event.data?.type === 'studio-ui-scale') {
            const incomingScale = normalizeExternalScale(event.data.scale);
            if(incomingScale !== null) externalScaleValue = incomingScale;
            setScaleMode(event.data.mode, false);
        }
        if(event.data?.type === 'studio-ui-scale-pause') pauseAutoScale(event.data.duration);
    });
    window.addEventListener('storage', event => {
        if(event.key === KEY || event.key === LEGACY_KEY) applyTheme(currentTheme());
        if(event.key === SCALE_KEY) applyScale(currentScaleMode());
    });
    window.addEventListener('resize', scheduleAutoScaleRefresh);
    window.addEventListener('scroll', lockScaledHorizontalScroll, { passive: true });
})();