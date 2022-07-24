const error = (m)=>new Error(m.message)

class Bmap extends Map {
	constructor(args = [], options = {}) {
     super();
     this._events={}
     if (Array.isArray(args) && args.length > 0) { args.forEach((value, index) => this.set(index, value)) };
     if(options instanceof Object && !(options instanceof Array)){
      const {MaxCache} = options
         if(Number.isInteger(MaxCache) && MaxCache > 0 && MaxCache !== -1){
             Object.defineProperty(this, "MaxCache", {value:MaxCache})
         }
     }
    }
  set(key, value){
    if(this.size >= this.MaxCache ) do{ super.delete(this.lastKey()) }while(this.has(key)?(this.size == this.MaxCache): (this.size < this.MaxCache) )
    this.has(key)?this.emit("edit", key, value, this.get(key)):this.emit("set", key, value)
    super.set(key, value)
  }
  delete(key){
    this.emit("delete", key, this.get(key))
    super.delete(key)
  }
	get array() { return [...this] }
}
Bmap.prototype.emit=function emit(eventName, ...data){
  if(!this._events)this._events={}
  if(typeof eventName === "string" && eventName.length <1)throw new error({message:"event name must be a non empty string"})
  if(!this._events[eventName])return false
  this._events[eventName].forEach(t=>t(...data))
  return true

}
Bmap.prototype.on=function on(eventName, callback, options={filter:()=>true, cooldown:undefined, uses:Infinity}){
  if(!this._events)this._events={}
  if(!typeof eventName === "string" && eventName.length <1)throw new error({message:"event name must be a non empty string"})
  if(typeof callback !== "function")throw new error({message:"callback must be a function"})
  if(!(!Array.isArray(options) && typeof options === "object"))new error({message:"options must be an object"})

  let { filter, cooldown, uses } = options
  if(![null, undefined].includes(filter))if(typeof filter !== "function")throw new error({message:"options.filter must be a function"})
  if(![null, undefined].includes(cooldown))if(typeof cooldown !== "number" || isNaN(Number(cooldown)) || !Number.isFinite(cooldown))throw new error({message:"options.cooldown must be a time in milliseconds"})
  if(![null, undefined].includes(uses))if(typeof uses !== "number" || isNaN(Number(uses)))throw new error({message:"options.uses must be a positive number"})
  if(typeof filter !== "function")filter = ()=>true
  if(typeof uses !== "number" || isNaN(Number(uses)))uses = Infinity

  let id = require("uuid").v4().replace(/-/g, "")
  const  listener=(...data)=>{
    if(!Boolean(filter(...data)))return 
    callback(...data)
    if(Number(uses)>0 && Number(uses)!==NaN){
      uses--
    }else{
      uses = 0
    }
    if(uses < 1) this._events[eventName].splice(this._events[eventName].indexOf(this._events[eventName].find(t=>t?.id===id)), 1)
  }
  listener.cooldown = isNaN(Number(cooldown))? null : setTimeout(()=>{this._events[eventName].splice(this._events[eventName].indexOf(this._events[eventName].find(t=>t?.id===id)), 1)}, Number(cooldown))
  listener.id = id

  if(!this._events[eventName])this._events[eventName]=[]
  this._events[eventName].push(listener)
  return this
}
Bmap.prototype.once=function once(eventName, callback, options={filter:()=>true, cooldown:undefined}){
  options.uses = 1
  return this.on(eventName, callback, options)
}
Bmap.prototype.collect = async function collect(eventName, options={filter:()=>true, cooldown:undefined}){
  return new Promise((resolve, reject)=>{
  if(!this._events)this._events={}
  if(!typeof eventName === "string" && eventName.length <1)throw new error({message:"event name must be a non empty string"})
  if(![null, undefined].includes(options))if(!(!Array.isArray(options) && typeof options === "object"))new error({message:"options must be an object"})

  let { filter, cooldown } = options
  if(![null, undefined].includes(filter))if(typeof filter !== "function")throw new error({message:"options.filter must be a function"})
  if(![null, undefined].includes(cooldown))if(typeof cooldown !== "number" || isNaN(Number(cooldown)) || !Number.isFinite(cooldown))throw new error({message:"options.cooldown must be a time in milliseconds"})
  if(typeof filter !== "function")filter = ()=>true

  let id = require("uuid").v4().replace(/-/g, "")
  const listener=(...data)=>{
    if(!Boolean(filter(...data)))return 
    else this._events[eventName].splice(this._events[eventName].indexOf(this._events[eventName].find(t=>t?.id===id)), 1)
    resolve([...data])
  }
  listener.cooldown = Number(cooldown) < 1 || isNaN(Number(cooldown)) || !Number.isFinite(cooldown)? null : setTimeout(()=>{this._events[eventName].splice(this._events[eventName].indexOf(this._events[eventName].find(t=>t?.id===id)), 1), reject("timeout")}, Number(cooldown))
  listener.id = id

  if(!this._events[eventName])this._events[eventName]=[]
  this._events[eventName].push(listener)
  return this
  })
}

Bmap.prototype.ensure = function(key, value){ if (this.has(key)) return this.get(key); this.set(key, value); return value; }
Bmap.prototype.hasAll = function(...keys){return keys.every(key => this.has(key))}
Bmap.prototype.hasAny = function(...keys){return keys.some(key => this.has(key))}
Bmap.prototype.hasNone = function(...keys){return !this.hasAny(...keys)}
Bmap.prototype.getAll = function(...keys){return keys.map(key => this.get(key))}
Bmap.prototype.getAny = function(...keys){return this.getAll(...keys).find(value => value !== undefined)}
Bmap.prototype.getNone = function(...keys){return this.getAll(...keys).find(value => value !== undefined)}
Bmap.prototype.getOne = function(...keys){return this.getAll(...keys).find(value => value !== undefined)}
Bmap.prototype.first = function(){return this.get(this.keys().next().value)}
Bmap.prototype.firstKey = function(){return this.keys().next().value}
Bmap.prototype.last = function(){return this.get(this.keys().next().value)}
Bmap.prototype.lastKey = function(){return this.keys().next().value}
Bmap.prototype.removeAll = function(...keys){return keys.forEach(key => this.delete(key))}
Bmap.prototype.at = function(index){return [...this.values()].at(Math.floor(index))}
Bmap.prototype.atKey = function(index){return [...this.keys()].at(Math.floor(index))}
Bmap.prototype.sort = function(callback){return this.array.sort(callback)}
Bmap.prototype.random = function random(length) {
  let i = [...this.values()];
  return typeof length == "undefined" ? i[Math.floor(Math.random() * i.length)] : !i.length || !length ? [] : Array.from({
	length: Math.min(length, i.length)
  }, () => i.splice(Math.floor(Math.random() * i.length), 1)[0]) 
}
Bmap.prototype.randomKey = function randomKey(length) {
  let i = [...this.keys()];
  return typeof length == "undefined" ? i[Math.floor(Math.random() * i.length)] : !i.length || !length ? [] : Array.from({
	length: Math.min(length, i.length)
  }, () => i.splice(Math.floor(Math.random() * i.length), 1)[0])
}
Bmap.prototype.reverse = function reverse() {
  let i = [...this.entries()];
  this.clear();
  i.reverse().forEach((value, index) => this.set(index, value));
}
Bmap.prototype.find = function(callback){return [...this.values()].find(callback);}
Bmap.prototype.findKey = function(callback){return [...this.keys()].find(callback)}
Bmap.prototype.findIndex = function(callback){return [...this.values()].findIndex(callback)}
Bmap.prototype.findKeyIndex = function(callback){return [...this.keys()].findIndex(callback)}
Bmap.prototype.sweep = function sweep(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = this.size;
  for (let [n, o] of this) e(o, n, this) && this.delete(n);
  return t - this.size
}
Bmap.prototype.filter = function filter(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new Bmap();
  for (let [n, o] of this) e(o, n, this) && t.set(n, o);
  return t
}
Bmap.prototype.map = function map(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = this.entries();
  return Array.from({
	length: this.size
  }, () => {
	let [n, o] = t.next().value;
	return e(o, n, this)
  })
}
Bmap.prototype.mapValues = function mapValues(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new this.constructor[Symbol.species];
  for (let [n, o] of this) t.set(n, e(o, n, this));
  return t
}
Bmap.prototype.some = function some(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  for (let [n, o] of this) if (e(o, n, this)) return true;
  return false
}
Bmap.prototype.reduce = function reduce(e, i, t){
  typeof i != "undefined" && (e = e.bind(i));
  let n = this.entries();
  return Array.from({
	length: this.size
  }, () => {
	let [o, r] = n.next().value;
	return t = t === undefined ? r : e(t, r, o, this)
  })
}
Bmap.prototype.every = function every(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  for (let [n, o] of this) if (!e(o, n, this)) return false;
  return true
}
Bmap.prototype.each = function each(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  for (let [n, o] of this) e(o, n, this);
  return this
}
Bmap.prototype.tap = function tap(e, i){
  return typeof i != "undefined" && (e = e.bind(i)), e(this), this
}
Bmap.prototype.partition = function partition(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new Bmap(), n = new Bmap();
  for (let [o, r] of this) e(r, o, this) ? t.set(o, r) : n.set(o, r);
  return [t, n]
}
Bmap.prototype.group = function group(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new Bmap();
  for (let [n, o] of this) t.has(n) ? t.get(n).push(o) : t.set(n, [o]);
  return t
}
Bmap.prototype.groupBy = function groupBy(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new Bmap();
  for (let [n, o] of this) t.has(n) ? t.get(n).push(o) : t.set(n, [o]);
  return t
}
Bmap.prototype.clone = function clone(){
  let i = new (this.constructor)();
  for (let [n, o] of this) i.set(n, o); 
  return i
}
Bmap.prototype.flatMap = function flatMap(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new Bmap();
  for (let [n, o] of this) Array.isArray(e = e(o, n, this)) && e.forEach(r => t.set(r[0], r[1]));
  return t
}
Bmap.prototype.flatMapValues = function flatMapValues(e, i){
  typeof i != "undefined" && (e = e.bind(i));
  let t = new this.constructor[Symbol.species];
  for (let [n, o] of this) Array.isArray(e = e(o, n, this)) && e.forEach(r => t.set(r[0], r[1]));
  return t
}

module.exports = Bmap
