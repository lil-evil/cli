const hello = {
    name:"hello",
    description:"hello world, only for testings purposes",
    exe:(data)=>{
        const { args, write } = data

        write("Hello, ", "World")
    }
}
const help = {
    name:"help",
    description:"you are seeing it",
    exe:(data)=>{
        const { args, write, commands } = data
        write(commands.map((v, name)=>`\t\x1b[32m${name}\x1b[0m\t \x1b[34m${v.description??""}\x1b[0m`
        ).join("\n"))
    }
}

module.exports = [
    hello,
    help
]