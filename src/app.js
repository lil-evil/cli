const blessed = require("@lilevil/blessed")
const Console = new (require("node:console").Console)({stdout:process.stdout, stderr:process.stderr})

class CLI extends require("node:events"){
    constructor(options){
        super()
        const _options = {console:{
            top: 0,
            left: 0,
            width:"100%-39",
            height:'100%-2',
            border:"line",
            label:"{red-fg}{bold}Console{/}",
            scrollbar: {
                bg: 'red'
            },
            scrollable:true,
            scrollback:250,
        }, log:{
            top:0,
            right:0,
            height:"100%-2",
            width:40,
            mouse:true,
            border:"line",
            scrollable:true,
            label:"{red-fg}{bold}Log{/}",
            scrollback:250,
            scrollbar: {
                bg: 'red'
              },
        }, informations:{
            bottom:0,
            left:0,
            height:3,
            width:"100%",
            mouse:true,
            border:"line",
            vi:false,
            label:"{red-fg}{bold}Informations{/}"
        },
        scope:{}};
        /* parse options */
        [ "informations", "console", "log"].forEach(type=>{
            if(typeof options.console === "object" && !Array.isArray(options.console)){
                const [c, _c] = [options[type], _options[type]]

                if(["string", "number"].includes(typeof c.width)){
                    _c.width = c.width
                }
                if(["string", "number"].includes(typeof c.height)){
                    _c.height = c.height
                }
                if(["string", "number"].includes(typeof c.top)){
                    _c.top = c.top
                }
                if(["string", "number"].includes(typeof c.bottom)){
                    _c.bottom = c.bottom
                }
                if(["string", "number"].includes(typeof c.left)){
                    _c.left = c.left
                }
                if(["string", "number"].includes(typeof c.right)){
                    _c.right = c.right
                }
                if(["string"].includes(typeof c.label)){
                    _c.label = c.label
                }

                if(type==="log"){
                    if(["number"].includes(typeof c.scrollback)){
                        _c.scrollback = c.scrollback
                    }
                }
                /* defaults */
                _c.tags=true
                _c.style= {
                    fg: 'default',
                    bg: 'default',
                    focus: {
                      border: {
                        fg: 'green'
                      }
                    }
                  }
                
            }
        })
        if(typeof options.scope === "object" && !Array.isArray(options.scope))_options.scope = options.scope
        this.options = _options

        require("./commands").forEach(t=>{
            this.register(t)
        })
    }
    id="lunae.cli"

    start(){
        const std = new (require("./std"))(this) /* eval core */
        this.std = std

        if(this.started)return
        else this.started = true
        this.displayed=true

        console.log = (...args)=>{
            if(this.displayed){
                this.log.log(...args)
            } else {
                return Console.log.bind(console)(...args)
            }
        }

        this.hide = function hide(){
            //this.display.hide()
            this.displayed = false
            this.render()
        }
        this.show = function show(){
            this.console.focus()
            this.displayed = true
            this.render()
        }
        
        this.stdrc = blessed.screen({
            smartCSR:true,
            useBCE:true,
            autoPadding:true,
            dockBorders:true,
            title:"lunae:cli"
        })
        const self = this
        this.console = blessed.terminal({
            parent: this.stdrc,
            handler: (data)=>std.handler.bind(std)(data),
            ...this.options.console
        })
        this.console.write(std.prompt)
        this.console.on("click", ()=>{
            this.console.focus()
        })
        this.log = blessed.Log({
            parent:this.stdrc,
            ...this.options.log
        })
        this.informations = blessed.text({
            parent:this.stdrc,
            ...this.options.informations
        })


        this.stdrc.key(["escape", "C-q"], (ch, key)=> {
            process.exit(0);
        })
        this.stdrc.render()
        this.render = function render(){if(this.displayed)this.stdrc.render()}
        this.show()
    }
    started=false

    static linker(lunae, options){
        const cli = new CLI(options)
        cli.lunae = lunae
        Object.defineProperty(cli, "lunae", {value:lunae, writable:false, configurable:false})

        cli.start()
        return cli
    }

    register(cmd){
        const name = cmd.name
        if(typeof name !== "string")throw new Error("missing name in the cmd object")
        if(typeof cmd.exe !== "function")throw new Error("<command>.exe must be type of function")
        if(this.commands.has(name))throw new Error("cannot overwrite an existing command, use .reload instead")

        this.commands.set(name, cmd)
    }
    reload(cmd){
        const name = cmd.name
        if(typeof name !== "string")throw new Error("missing name in the cmd object")
        if(typeof cmd.exe !== "function")throw new Error("<command>.exe must be type of function")
        if(!this.commands.has(name))throw new Error("cannot reload a non existing command")


        this.commands.get(cmd).exe = cmd.exe
    }
    commands = new (require("./bmap"))()
}


module.exports = CLI
module.exports.extension = CLI.linker