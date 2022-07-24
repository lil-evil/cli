const ansi = require("ansi-code");
class Evaluate{
    constructor(scope = {}, parent){
        this.parent = parent
        const vm = require("node:vm")

        this.session = new (require("node:inspector").Session)()
        this.session.connect()
        this.session.post("Runtime.enable")
        this.session.once('Runtime.executionContextCreated', ({params})=>{
            this.sessionId = params.context.id
        })
        if(!this.context){
            this.context = vm.createContext(scope)
            this.session.post("Runtime.disable")
            Object.getOwnPropertyNames(global).forEach(t=>Object.defineProperty(this.context, t, {
                    __proto__: null,
                    ...Object.getOwnPropertyDescriptor(global, t),
            }))
            Object.defineProperty(this.context, 'require', {
                __proto__: null,
                configurable: true,
                writable: true,
                value:require
              });
              Object.defineProperty(this.context, 'context', {
                __proto__: null,
                configurable: true,
                writable: true,
                value:this.context
              });

              this.sessionId
        }
    }
    history =  new History(this)
    tab=0
    builtins=[
        "require", "break", "do", "instanceof", "case", "else", "new", "catch", "finally", "return", "continue", "for", "switch", "debugger", "function", "this", "default", "if", "throw", "delete", "in", "try", "class", "extends", "const", "let", "import", "yield"
    ]
    list=[]
    updateBuffer(d, write){
        const data = d.key
        const key = d.char ?? ""
        if(!this.buffer || !this.buffer?.line || !this.buffer?.cursor){
            this.buffer =(typeof this.buffer === "object" ? Object.assign({line:"", cursor:0}, this.buffer):{line:"", cursor:0})
        }


        /* special keys */
        const kkeys = [[true, false, "l"], [true, false, "f"], [false, true, "tab"]]
        if(kkeys.includes([data.ctrl, data.shift, data.name]))return

        const { name, full } = data

        if(name !== "tab")this.tab = 0
        if( name === "escape"){return} /* mess with the buffer */
        else if( name === "backspace"){  /* erase caracter before cursor */
            if(this.buffer.cursor <= 0)return 
            this.buffer.line = this.buffer.line.slice(0,this.buffer.cursor-1)+this.buffer.line.slice(this.buffer.cursor)
            this.buffer.cursor-=1
        }
        else if(name === "delete"){ /* erase caracter after cursor */
        if(this.buffer.cursor>=this.buffer.line.length)return 
        this.buffer.line = this.buffer.line.slice(0,this.buffer.cursor)+this.buffer.line.slice(this.buffer.cursor+1)
        }
        else if( name === "return" ){    /* clear buffer and pos, and send the line to the client */
        }
        else if(["C-l", "C-k", "C-z"].includes(full)){return} /* prevent buffer coruption */
        /* handle cursor deplacement */ 
        else if(name==="left" && this.buffer.cursor>0){
            if(data.ctrl){ /*words by words */
                //this.buffer.line.split(/(?:\.| |\(|\))/g)
            } else this.buffer.cursor-=1
        } else if(name==="tab"){
            if(this.tab > 1){
                this.tab=0
                this.applySuggestion(write)
            }
            this.applySuggestion(write, true)
            this.tab++
        } else if(name==="right"){
            if(this.buffer.cursor===this.buffer.line.length){this.applySuggestion(write); return }
            if(data.ctrl){ /*words by words */

            }else this.buffer.cursor+=1
        } else if(name==="up"){
            this.buffer.line = this.history.next()
            this.buffer.cursor = this.buffer.line.length
        } else if(name==="down"){
            this.buffer.line = this.history.before()
            this.buffer.cursor = this.buffer.line.length
        } else if(name==="end"){
            this.buffer.cursor = this.buffer.line.length
        } else if(name==="home"){
            this.buffer.cursor = 0
        } else if(key.length>0 && !full?.startsWith("C-")){this.buffer.line = this.buffer.line.slice(0,this.buffer.cursor)+key+this.buffer.line.slice(this.buffer.cursor); this.buffer.cursor+=1}
        else return true
    }
    eval(write, newLine, scope = {}, prompts){
        let evaluated, error, vm = require("node:vm")
        if(this.buffer.line.trim().match(/^\..+$/)){
            const input = this.buffer.line.trim().slice(1)

            const cmd = input.split(" ")[0]
            if(!this.parent.parent.commands.has(cmd)){
                return write(newLine(), prompts.error, "Use .help to get a list of commands")
            } else {
                const args = input.split(" ").slice(1)
                
                const c = this.parent.parent.commands.get(cmd)
                if(typeof c.exe !== "function"){
                    return write(newLine(), prompts.error, "this command cannot be executed. missing <command>.exe function")
                } else {
                    try{
                        write(newLine())
                        function write2(...args){
                            return write(args.map(t=>typeof t === "string"?t.replace(/\n/g, ()=>newLine()): t?.toString()?.replace(/\n/g, ()=>newLine())).join(""))
                        }
                        c.exe({args, write:write2, commands:this.parent.parent.commands})
                    } catch (err){
                        write(prompts.error, "an error occured: "+err)
                    }
                    return
                }
            }
        }
        try{
            const input = this.buffer.line
            evaluated = require("util").inspect(vm.runInContext(input, this.context), {depth:0, colors:true})
            error = false
        } catch(err){
            evaluated = err
            error = true
        }
        try{
            evaluated = evaluated?.replace(/\n/g, ()=>newLine())
        }catch(e){}
        
        if(error){
            write(newLine(), prompts.error, evaluated)
        } else {
            write(newLine(), evaluated)
        }
    }
    clean(){
        this.buffer = {line:"", cursor:0}
        this.history.index=0
        this.suggestion = false
    }
    async suggest(write){
        if(this.buffer.line.trim().match(/^\..+$/)){
            const text = this.buffer.line.trim().slice(1)
            const commands = this.parent.parent.commands
            let suggestion

            const items = commands.filter((_,k)=>k.startsWith(text)).filter(Boolean).array
            if(items.length < 1){
                return this.suggestion = false
            }
            let lowest = items.sort((a, b)=>a[0].length-b[0].length)[0][1]
            if(items.every(t=>t[0].startsWith(lowest))) suggestion = lowest.name.slice(text.length)
            else if(items.length > 1){this.suggestion = false; return this.list = items.array}
            else suggestion = items[0][1].name.slice(text.length)


            this.suggestion = suggestion
            write(ansi.cursor.to(this.buffer.line.length+2),"\x1b[2;90m",suggestion, "\x1b[0m", ansi.cursor.to(this.buffer.cursor+2))
        }
        let text = this.buffer.line.trim().split(/(?: |;|,)/g), list = [...this.builtins], suggestion
        text = text[text.length-1]
        if(text.split(/(?:\.|\?\.)/g).length > 1){ /* property */
            text = text.split(/(?:\.|\?\.)/g)
            if(text[text.length-1].match(/(?:[A-Za-z0-9]|_)$/) == null)return this.suggestion = false
            if(text[text.length-1].length < 1)return this.suggestion = false

            let items = []
            const obj = text[0]+(text.length > 2 ? text.map((e,i,a)=>{
                if(i===0 || i === a.length-1)return
                return `["${e}"]`
            }).join(""):"")

            try{
                items = require("node:vm").runInContext(`Object.getOwnPropertyNames(${obj}).filter(t=>t.startsWith("${text[text.length-1]}"))`, this.context)
            } catch(err){}

            if(items.length < 1)return this.suggestion = false;
            let lowest = items.sort((a, b)=>a.length-b.length)[0]
            if(items.every(t=>t.startsWith(lowest))) suggestion = lowest.slice(text[text.length-1].length)
            else if(items.length > 1){this.suggestion = false; return this.list = items}
            else suggestion = items[0].slice(text[text.length-1].length)
            
        }else { /* keyword or variable */
            const l = new Promise((resolve)=>{
                this.session.post("Runtime.globalLexicalScopeNames", {executionContextId:this.sessionId}, (err,data)=>{
                    if(!data.names)resolve([])
                    else resolve(data.names)
                })
            })
            ;(await l).forEach(t=>list.push(t))
            if(list.filter(t=>t.startsWith(text)).length > 1)return this.list = list.filter(t=>t.startsWith(text))
            let item = list.find(t=>t.startsWith(text))
            if(!item){ /* var or global var */
                const items = Object.getOwnPropertyNames(global).filter(t=>t.startsWith(text))
                if(items.length < 1)return this.suggestion = false;
                let lowest = items.sort((a, b)=>a.length-b.length)[0]
                if(items.every(t=>t.startsWith(lowest))) suggestion = lowest.slice(text.length)
                else if(items.length > 1){this.suggestion = false; return this.list = items}
                else suggestion = items[0].slice(text.length)
            }else{ /* keyword */
                suggestion = item.slice(text.length)
            }
        }
        this.suggestion = suggestion
        write(ansi.cursor.to(this.buffer.line.length+2),"\x1b[2;90m",suggestion, "\x1b[0m", ansi.cursor.to(this.buffer.cursor+2))
    }
    cleanSuggest(write){
        write(ansi.cursor.to(this.buffer.line.length+2),
        ansi.cursor.eraseForward, 
        ansi.cursor.to(this.buffer.cursor+2),)
    }
    applySuggestion(write, display){
        if(display){
            const list=this.builtins


            return
        }
        if(!this.suggestion)return
        else{
            this.buffer.line+=this.suggestion
            this.buffer.cursor = this.buffer.line.length
            
        }
    }
}
class History extends Array{
    constructor(parent){
        super()
        this.parent = parent
    }
    size=100
    index=-1
    unshift(item){
        if(item === this[0])return
        if(this.length >=this.size) this.pop()

        super.unshift(item)
    }
    clean(){
        for(let i = this.length; i > 0; i--){
            this.pop()
        }
    }
    next(){
        if(!(this.index in this))return this.parent.buffer.line
        if(this.index == 0)this.parent.buffer.before = this.parent.buffer.line
        this.index++
        return this[this.index-1]
    }
    before(){
        if(!(this.index-1 in this))return this.parent.buffer.line
        this.index--
        if(!(this.index-1 in this))return this.parent.buffer.before
        return this[this.index-1]
    }
}


class STD{
    constructor(parent){
        this.parent = parent
        this.eval = new Evaluate(parent.options.scope, this)
    }
    prompt="> "
    errorPrompt = `[ ${ansi.font.color.red}Error${ansi.font.reset} ]: `

    handler(data){
        this.keypress(this.callback.bind(this.parent.console, this), data)
    }
    callback(self, d){
        const write = (...arg)=>{this.write(arg.join("")); this.screen.render()}
        write.newLine = (()=>{
            const cy = this.term.y, sy = this.term.rows
            if(cy >= sy-1)return ansi.screen.scrollUp(1)+ansi.cursor.to(0)
            else return ansi.cursor.nextLine()+ansi.cursor.to(0)
        }).bind(this)
        if(self.eval.buffer?.line?.length <=0)write(self.prompt)
        if(self.eval.updateBuffer(d, write))return

        const { type, char, key } = d

        if(key.name === "return"){ // enter !!evaluate!!
            self.eval.cleanSuggest(write)
            self.eval.eval(write.bind(this), write.newLine, self.parent.options.scope, {error:self.errorPrompt})
            self.eval.history.unshift(self.eval.buffer.line)
            self.eval.clean()
            return write(write.newLine(), self.prompt)
        } else if(key.full === "C-l"){
            write(ansi.screen.erase,
                ansi.cursor.to(0,0),
                self.prompt,
                self.eval.buffer.line,
                ansi.cursor.to(self.eval.buffer.cursor+2))
        } else{
            write(ansi.cursor.to(self.eval.buffer.line.length), 
            ansi.cursor.eraseForward,
            ansi.cursor.to(0),
            self.prompt,
            ansi.cursor.to(self.prompt.length),
            self.eval.buffer.line,
            ansi.cursor.to(self.eval.buffer.cursor+2))
        }
        self.eval.suggest(write)
    }
    metaKeyCodeRe = /^(?:\x1b)([a-zA-Z0-9])$/;
    functionKeyCodeRe = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;
    keypress(callback, s) {
    var ch,
        key = {
            name: undefined,
            ctrl: false,
            meta: false,
            shift: false
        },
        parts;
    
    if (Buffer.isBuffer(s)) {
        if (s[0] > 127 && s[1] === undefined) {
        s[0] -= 128;
        s = '\x1b' + s.toString('utf-8')
        } else {
        s = s.toString('utf-8');
        }
    }
    
    key.sequence = s;
    
    if (s === '\r') {
        // carriage return
        key.name = 'return';
    
    } else if (s === '\n') {
        // enter, should have been called linefeed
        key.name = 'enter';
    
    } else if (s === '\t') {
        // tab
        key.name = 'tab';
    
    } else if (s === '\b' || s === '\x7f' ||
                s === '\x1b\x7f' || s === '\x1b\b') {
        // backspace or ctrl+h
        key.name = 'backspace';
        key.meta = (s.charAt(0) === '\x1b');
    
    } else if (s === '\x1b' || s === '\x1b\x1b') {
        // escape key
        key.name = 'escape';
        key.meta = (s.length === 2);
    
    } else if (s === ' ' || s === '\x1b ') {
        key.name = 'space';
        key.meta = (s.length === 2);
    
    } else if (s <= '\x1a') {
        // ctrl+letter
        key.name = String.fromCharCode(s.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
        key.ctrl = true;
    
    } else if (s.length === 1 && s >= 'a' && s <= 'z') {
        // lowercase letter
        key.name = s;
    
    } else if (s.length === 1 && s >= 'A' && s <= 'Z') {
        // shift+letter
        key.name = s.toLowerCase();
        key.shift = true;
    
    } else if (parts = this.metaKeyCodeRe.exec(s)) {
        // meta+character key
        key.name = parts[1].toLowerCase();
        key.meta = true;
        key.shift = /^[A-Z]$/.test(parts[1]);
    
    } else if (parts = this.functionKeyCodeRe.exec(s)) {
        // ansi escape sequence
    
        // reassemble the key code leaving out leading \x1b's,
        // the modifier key bitflag and any meaningless "1;" sequence
        var code = (parts[1] || '') + (parts[2] || '') +
                    (parts[4] || '') + (parts[6] || ''),
            modifier = (parts[3] || parts[5] || 1) - 1;
    
        // Parse the key modifier
        key.ctrl = !!(modifier & 4);
        key.meta = !!(modifier & 10);
        key.shift = !!(modifier & 1);
        key.code = code;
    
        // Parse the key itself
        switch (code) {
        /* xterm/gnome ESC O letter */
        case 'OP': key.name = 'f1'; break;
        case 'OQ': key.name = 'f2'; break;
        case 'OR': key.name = 'f3'; break;
        case 'OS': key.name = 'f4'; break;
    
        /* xterm/rxvt ESC [ number ~ */
        case '[11~': key.name = 'f1'; break;
        case '[12~': key.name = 'f2'; break;
        case '[13~': key.name = 'f3'; break;
        case '[14~': key.name = 'f4'; break;
    
        /* from Cygwin and used in libuv */
        case '[[A': key.name = 'f1'; break;
        case '[[B': key.name = 'f2'; break;
        case '[[C': key.name = 'f3'; break;
        case '[[D': key.name = 'f4'; break;
        case '[[E': key.name = 'f5'; break;
    
        /* common */
        case '[15~': key.name = 'f5'; break;
        case '[17~': key.name = 'f6'; break;
        case '[18~': key.name = 'f7'; break;
        case '[19~': key.name = 'f8'; break;
        case '[20~': key.name = 'f9'; break;
        case '[21~': key.name = 'f10'; break;
        case '[23~': key.name = 'f11'; break;
        case '[24~': key.name = 'f12'; break;
    
        /* xterm ESC [ letter */
        case '[A': key.name = 'up'; break;
        case '[B': key.name = 'down'; break;
        case '[C': key.name = 'right'; break;
        case '[D': key.name = 'left'; break;
        case '[E': key.name = 'clear'; break;
        case '[F': key.name = 'end'; break;
        case '[H': key.name = 'home'; break;
    
        /* xterm/gnome ESC O letter */
        case 'OA': key.name = 'up'; break;
        case 'OB': key.name = 'down'; break;
        case 'OC': key.name = 'right'; break;
        case 'OD': key.name = 'left'; break;
        case 'OE': key.name = 'clear'; break;
        case 'OF': key.name = 'end'; break;
        case 'OH': key.name = 'home'; break;
    
        /* xterm/rxvt ESC [ number ~ */
        case '[1~': key.name = 'home'; break;
        case '[2~': key.name = 'insert'; break;
        case '[3~': key.name = 'delete'; break;
        case '[4~': key.name = 'end'; break;
        case '[5~': key.name = 'pageup'; break;
        case '[6~': key.name = 'pagedown'; break;
    
        /* putty */
        case '[[5~': key.name = 'pageup'; break;
        case '[[6~': key.name = 'pagedown'; break;
    
        /* rxvt */
        case '[7~': key.name = 'home'; break;
        case '[8~': key.name = 'end'; break;
    
        /* rxvt keys with modifiers */
        case '[a': key.name = 'up'; key.shift = true; break;
        case '[b': key.name = 'down'; key.shift = true; break;
        case '[c': key.name = 'right'; key.shift = true; break;
        case '[d': key.name = 'left'; key.shift = true; break;
        case '[e': key.name = 'clear'; key.shift = true; break;
    
        case '[2$': key.name = 'insert'; key.shift = true; break;
        case '[3$': key.name = 'delete'; key.shift = true; break;
        case '[5$': key.name = 'pageup'; key.shift = true; break;
        case '[6$': key.name = 'pagedown'; key.shift = true; break;
        case '[7$': key.name = 'home'; key.shift = true; break;
        case '[8$': key.name = 'end'; key.shift = true; break;
    
        case 'Oa': key.name = 'up'; key.ctrl = true; break;
        case 'Ob': key.name = 'down'; key.ctrl = true; break;
        case 'Oc': key.name = 'right'; key.ctrl = true; break;
        case 'Od': key.name = 'left'; key.ctrl = true; break;
        case 'Oe': key.name = 'clear'; key.ctrl = true; break;
    
        case '[2^': key.name = 'insert'; key.ctrl = true; break;
        case '[3^': key.name = 'delete'; key.ctrl = true; break;
        case '[5^': key.name = 'pageup'; key.ctrl = true; break;
        case '[6^': key.name = 'pagedown'; key.ctrl = true; break;
        case '[7^': key.name = 'home'; key.ctrl = true; break;
        case '[8^': key.name = 'end'; key.ctrl = true; break;
    
        /* misc. */
        case '[Z': key.name = 'tab'; key.shift = true; break;
        default: key.name = 'undefined'; break;
    
        }
    } else if (s.length > 1 && s[0] !== '\x1b') {
        // Got a longer-than-one string of characters.
        // Probably a paste, since it wasn't a control sequence.
        const self = this
        Array.prototype.forEach.call(s, function(c) {
            self.keypress(callback,c);
        });
        return;
    }
    
    // XXX: this "mouse" parsing code is NOT part of the node-core standard
    // `readline.js` module, and is a `keypress` module non-standard extension.
    if (key.code == '[M') {
        key.name = 'mouse';
        var s = key.sequence;
        var b = s.charCodeAt(3);
        key.x = s.charCodeAt(4) - 40;
        key.y = s.charCodeAt(5) - 40;
    
        key.scroll = 0;
    
        key.ctrl  = !!(1<<4 & b);
        key.meta  = !!(1<<3 & b);
        key.shift = !!(1<<2 & b);
    
        key.release = (3 & b) === 3;
    
        if (1<<6 & b) { //scroll
        key.scroll = 1 & b ? 1 : -1;
        }
    
        if (!key.release && !key.scroll) {
        key.button = b & 3;
        }
    }
    
    // Don't emit a key if no name was found
    if (key.name === undefined) {
        key = undefined;
    }
    
    if (s.length === 1) {
        ch = s;
    }
    
    if (key && key.name == 'mouse') {
        return callback({type:"mouse",key:key??{}})
    } else if (key || ch) {
        if(key){
            key.full = `${key.ctrl ? "C-": key.meta ? "A-" : key.shift ? "S-": ""}${key?.name}`
        }
        return callback({type:"key", char:ch, key:key ??{}})
    }
    }
}

module.exports = STD