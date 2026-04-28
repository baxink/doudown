/**
 * Douyin API signer - ports the a_bogus signing algorithm from Cloudflare Workers
 * Run: node douyin-signer.js
 */

const http = require('http');

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

// ============ SM3 (Chinese hash algorithm) ============
class SM3 {
    constructor() { this.reg = []; this.chunk = []; this.size = 0; this.reset(); }
    reset() {
        this.reg = [1937774191, 1226093241, 388252375, 3666478592, 2842636476, 372324522, 3817729613, 2969243214];
        this.chunk = []; this.size = 0;
    }
    write(input) {
        const bytes = typeof input === 'string'
            ? Array.from(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), c => c.charCodeAt(0))
            : Array.from(input);
        this.size += bytes.length;
        let free = 64 - this.chunk.length;
        if (bytes.length < free) { this.chunk = this.chunk.concat(bytes); return; }
        this.chunk = this.chunk.concat(bytes.slice(0, free));
        while (this.chunk.length >= 64) { this._compress(this.chunk); this.chunk = bytes.slice(free, Math.min(free + 64, bytes.length)); free += 64; }
    }
    sum(input, format) {
        if (input) { this.reset(); this.write(input); }
        this._fill();
        for (let i = 0; i < this.chunk.length; i += 64) this._compress(this.chunk.slice(i, i + 64));
        if (format === 'hex') {
            let r = ''; for (let i = 0; i < 8; i++) r += se(this.reg[i].toString(16), 8, '0'); this.reset(); return r;
        }
        let r = new Array(32);
        for (let i = 0; i < 8; i++) { let c = this.reg[i]; r[4*i+3]=(c&255)>>>0; c>>>=8; r[4*i+2]=(c&255)>>>0; c>>>=8; r[4*i+1]=(c&255)>>>0; c>>>=8; r[4*i]=(c&255)>>>0; }
        this.reset(); return r;
    }
    _compress(t) {
        const w = new Array(132);
        for (let i = 0; i < 16; i++) { w[i] = ((t[4*i]<<24)|(t[4*i+1]<<16)|(t[4*i+2]<<8)|t[4*i+3])>>>0; }
        for (let i = 16; i < 68; i++) { let a=w[i-16]^w[i-9]^le(w[i-3],15); a=le(a,15)^le(a,23)^w[i-6]; w[i]=(a^le(w[i-13],7))>>>0; }
        for (let i = 0; i < 64; i++) w[i+68]=(w[i]^w[i+4])>>>0;
        const S = this.reg.slice(0);
        for (let i = 0; i < 64; i++) {
            const ss1 = le(((le(S[0],12)+S[4]+le(de(i),i))>>>0)&0xffffffff,7);
            const ss2 = le(ss1^le(S[0],12),32);
            const tt1 = pe(i,S[0],S[1],S[2]); const tt2 = he(i,S[0],S[1],S[2]);
            S[3]=S[2]; S[2]=le(S[1],9); S[1]=S[0]; S[0]=(tt1+S[3]+ss2+w[i+68])>>>0;
            S[7]=S[6]; S[6]=le(S[5],19); S[5]=S[4]; S[4]=(tt2^le(tt2,9)^le(tt2,17))>>>0;
        }
        for (let i = 0; i < 8; i++) this.reg[i]=(this.reg[i]^S[i])>>>0;
    }
    _fill() {
        const totalBits = 8*this.size;
        let mod = this.chunk.push(128)%64;
        if (64-mod < 8) mod -= 64;
        while (mod < 56) { this.chunk.push(0); mod++; }
        for (let i = 0; i < 4; i++) this.chunk.push((totalBits/(4294967296**i))&255);
        for (let i = 0; i < 4; i++) this.chunk.push((totalBits/Math.pow(256,i))&255);
    }
}
function le(e,r) { return ((e<<(r%32))|(e>>>(32-(r%32))))>>>0; }
function de(e) { return e<16?2043430169:2055708042; }
function pe(e,r,t,n) { return e<16?(r^t^n)>>>0:((r&t)|(r&n)|(t&n))>>>0; }
function he(e,r,t,n) { return e<16?(r^t^n)>>>0:((r&~t)|n)>>>0; }
function se(v,w,f) { v=String(v); while(v.length<w) v=f+v; return v; }

// ============ RC4 ============
function rc4(plaintext, key) {
    const s=Array.from({length:256},(_,i)=>i);
    let k=0;
    for(let i=0;i<256;i++) k=(k+s[i]+key.charCodeAt(i%key.length))%256, [s[i],s[k]]=[s[k],s[i]];
    let ii=0,j=0,cipher=[];
    for(let p=0;p<plaintext.length;p++) ii=(ii+1)%256, j=(j+s[ii])%256, [s[ii],s[j]]=[s[j],s[ii]], cipher.push(String.fromCharCode(s[(s[ii]+s[j])%256]^plaintext.charCodeAt(p)));
    return cipher.join('');
}

// ============ a_bogus generator ============
function gener_random(random, option) {
    return [
        ((random&255&170)|(option[0]&85))>>>0,
        ((random&255&85)|(option[0]&170))>>>0,
        (((random>>8)&255&170)|(option[1]&85))>>>0,
        (((random>>8)&255&85)|(option[1]&170))>>>0,
    ];
}
function generate_random_str() {
    let r = [];
    r = r.concat(gener_random(Math.random()*10000, [3,45]));
    r = r.concat(gener_random(Math.random()*10000, [1,0]));
    r = r.concat(gener_random(Math.random()*10000, [1,5]));
    return String.fromCharCode.apply(null, r);
}
function result_encrypt(long_str, num=4) {
    const s = {
        0:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
        1:"Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        2:"Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        3:"ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe",
        4:"Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe",
    };
    const c = { 0:16515072, 1:258048, 2:4032, str:s[num] };
    let result='', round=0, longInt=0;
    for(let i=0;i<(long_str.length/3)*4;i++){
        if(Math.floor(i/4)!==round){round++; longInt=(long_str.charCodeAt(round*3)<<16)|(long_str.charCodeAt(round*3+1)<<8)|long_str.charCodeAt(round*3+2);}
        const key=i%4, tempInt=key===0?(longInt&c[0])>>18:key===1?(longInt&c[1])>>12:key===2?(longInt&c[2])>>6:longInt&63;
        result+=c.str.charAt(tempInt);
    }
    return result;
}
function get_long_int(round,long_str){ return (long_str.charCodeAt(round*3)<<16)|(long_str.charCodeAt(round*3+1)<<8)|long_str.charCodeAt(round*3+2); }

function generate_rc4_bb_str(url_sp, ua, window_env) {
    const sm3=new SM3();
    const start=Date.now();
    const url_sp_list=sm3.sum(sm3.sum(url_sp+'cus'));
    const cus=sm3.sum(sm3.sum('cus'));
    const ua_enc=sm3.sum(result_encrypt(rc4(ua,String.fromCharCode(0.00390625,1,14)),3));
    const end=Date.now();
    const b={8:3,10:end,15:{aid:6383,pageId:6241,boe:false,ddrt:7,paths:{include:[{},{},{},{},{},{},{}],exclude:[]},track:{mode:0,delay:300,paths:[]},dump:true,rpU:""},16:start,18:44,19:[1,0,1,5]};
    b[20]=(b[16]>>24)&255; b[21]=(b[16]>>16)&255; b[22]=(b[16]>>8)&255; b[23]=b[16]&255;
    b[24]=Math.floor(b[16]/256/256/256/256); b[25]=Math.floor(b[16]/256/256/256/256/256);
    b[26]=0;b[27]=0;b[28]=0;b[29]=0;
    b[30]=0;b[31]=0;b[32]=0;b[33]=0;
    b[34]=0;b[35]=0;b[36]=0;b[37]=0;
    b[38]=url_sp_list[21];b[39]=url_sp_list[22];b[40]=cus[21];b[41]=cus[22];b[42]=ua_enc[23];b[43]=ua_enc[24];
    b[44]=(b[10]>>24)&255;b[45]=(b[10]>>16)&255;b[46]=(b[10]>>8)&255;b[47]=b[10]&255;
    b[48]=b[8];b[49]=Math.floor(b[10]/256/256/256/256);b[50]=Math.floor(b[10]/256/256/256/256/256);
    b[51]=b[15].pageId;b[52]=(b[15].pageId>>24)&255;b[53]=(b[15].pageId>>16)&255;b[54]=(b[15].pageId>>8)&255;b[55]=b[15].pageId&255;
    b[56]=b[15].aid;b[57]=b[15].aid&255;b[58]=(b[15].aid>>8)&255;b[59]=(b[15].aid>>16)&255;b[60]=(b[15].aid>>24)&255;
    const w=[]; for(let i=0;i<window_env.length;i++) w.push(window_env.charCodeAt(i));
    b[64]=w.length;b[65]=b[64]&255;b[66]=(b[64]>>8)&255;
    b[69]=0;b[70]=0;b[71]=0;
    b[72]=b[18]^b[20]^b[26]^b[30]^b[34]^b[58]^b[38]^b[40]^b[53]^b[42]^b[21]^b[27]^b[54]^b[55]^b[31]^b[35]^b[57]^b[39]^b[41]^b[43]^b[22]^b[28]^b[32]^b[60]^b[36]^b[23]^b[29]^b[33]^b[37]^b[44]^b[45]^b[59]^b[46]^b[47]^b[48]^b[49]^b[50]^b[24]^b[25]^b[52]^b[53]^b[54]^b[55]^b[57]^b[58]^b[59]^b[60]^b[65]^b[66]^b[70]^b[71];
    let bb=[b[18],b[20],b[52],b[26],b[30],b[34],b[58],b[38],b[40],b[53],b[42],b[21],b[27],b[54],b[55],b[31],b[35],b[57],b[39],b[41],b[43],b[22],b[28],b[32],b[60],b[36],b[23],b[29],b[33],b[37],b[44],b[45],b[59],b[46],b[47],b[48],b[49],b[50],b[24],b[25],b[65],b[66],b[70],b[71]];
    bb=bb.concat(w).concat(b[72]);
    return rc4(String.fromCharCode.apply(null,bb),String.fromCharCode.apply(null,[121]));
}

function generate_a_bogus(url_sp, ua) {
    const r=generate_random_str()+generate_rc4_bb_str(url_sp,ua,"1536|747|1536|834|0|30|0|0|1536|834|1536|864|1525|747|24|24|Win32");
    return result_encrypt(r,4)+'=';
}

// ============ HTTP helpers ============
function httpGet(url, headers) {
    return new Promise((resolve, reject) => {
        const u=new URL(url);
        const secure=u.protocol==='https:';
        const opts={hostname:u.hostname,port:u.port||(secure?443:80),path:u.pathname+u.search,method:'GET',headers:headers||{},...((secure)?{rejectUnauthorized:false}:{})};
        const mod=secure?require('https'):require('http');
        const req=mod.request(opts,res=>{
            let data='';
            res.on('data',c=>data+=c);
            res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));
        });
        req.on('error',reject);
        req.setTimeout(10000,()=>{req.destroy(); reject(new Error('timeout'));});
        req.end();
    });
}

function httpPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const u=new URL(url);
        const bodyStr=typeof body==='string'?body:JSON.stringify(body);
        const secure=u.protocol==='https:';
        const opts={hostname:u.hostname,port:u.port||(secure?443:80),path:u.pathname+u.search,method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(bodyStr)},...((secure)?{rejectUnauthorized:false}:{})};
        const mod=(u.protocol==='https:')?require('https'):require('http');
        const req=mod.request(opts,res=>{
            let data='';
            res.on('data',c=>data+=c);
            res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));
        });
        req.on('error',reject);
        req.setTimeout(10000,()=>{req.destroy(); reject(new Error('timeout'));});
        req.write(bodyStr);
        req.end();
    });
}

function getTtwid() {
    return httpPost('https://ttwid.bytedance.com/ttwid/union/register/', {
        'Content-Type':'application/json',
        'User-Agent':UA,
        'Referer':'https://www.douyin.com/',
    }, {region:'cn',aid:6383,need_t:1,service:'www.douyin.com',migrate_priority:0,cb_url_protocol:'https',domain:'.douyin.com'}).then(r=>{
        const setCookie=Array.isArray(r.headers['set-cookie'])?r.headers['set-cookie'].join(', '):(r.headers['set-cookie']||'');
        const m=setCookie.match(/(?:^|,\s*)ttwid=([^;\s]+)/i);
        return m?decodeURIComponent(m[1]):null;
    });
}

function extractUrl(text) {
    const m=text.match(/\bhttps?:\/\/(?:www\.|[-a-zA-Z0-9.@:%_+~#=]{1,256}\.[a-zA-Z0-9()]{1,6})\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)?/i);
    return m?m[0]:null;
}

function extractVideoId(url) {
    try {
        const u=new URL(url);
        // try query params first
        for(const k of ['modal_id','vid','id','v','s','pid']) {
            const v=u.searchParams.get(k);
            if(v) return v;
        }
        // extract from path: /share/video/{id} or /video/{id}
        const pathParts=u.pathname.split('/').filter(Boolean);
        // find video ID - usually the numeric segment
        for(let i=pathParts.length-1;i>=0;i--){
            if(/^\d{15,}$/.test(pathParts[i])) return pathParts[i];
        }
        // last fallback: last path segment
        const last=pathParts[pathParts.length-1]||'';
        if(last.endsWith('.html')) return last.slice(0,-5);
        if(/^\d+$/.test(last)) return last;
        return null;
    } catch { return null; }
}

function followRedirect(url, max=8) {
    return new Promise(async (resolve)=>{
        let current=url;
        for(let i=0;i<max;i++){
            const u=new URL(current);
            // if already on target domain, return
            if(u.host==='www.douyin.com'||u.host==='www.iesdouyin.com'){resolve(current);return;}
            try {
                const r=await httpGetManual(current,{'User-Agent':UA,'Accept':'text/html,*/*'});
                if(!r) {resolve(null);return;}
                if(r.status>=300&&r.status<400&&r.headers.location){
                    current=new URL(r.headers.location,current).toString();
                } else {resolve(current);return;}
            } catch(e) {resolve(null);return;}
        }
        resolve(null);
    });
}

// manual redirect - doesn't auto-follow
function httpGetManual(url, headers) {
    return new Promise((resolve,reject)=>{
        const u=new URL(url);
        const secure=u.protocol==='https:';
        const opts={hostname:u.hostname,port:u.port||(secure?443:80),path:u.pathname+u.search,method:'GET',headers,...((secure)?{rejectUnauthorized:false}:{})};
        const mod=secure?require('https'):require('http');
        const req=mod.request(opts,res=>{
            // capture location header before anything else
            const loc=res.headers.location||res.headers.Location||null;
            let data='';
            res.on('data',c=>data+=c);
            res.on('end',()=>resolve({status:res.statusCode,headers:{...res.headers,location:loc},body:data}));
        });
        req.on('error',reject);
        req.setTimeout(10000,()=>{req.destroy();reject(new Error('timeout'));});
        req.end();
    });
}

function randomMsToken(len=107) {
    const b="ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789=";
    let r=''; for(let i=0;i<len;i++) r+=b[Math.floor(Math.random()*b.length)]; return r;
}

function isObj(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function str(v){return typeof v==='string'?v:v==null?'':String(v);}
function toHttps(u){if(!u)return null;return u.startsWith('http://')?'https://'+u.slice(7):u;}

function pickCover(d) {
    const v=isObj(d?.video)?d.video:null;
    if(v){
        if(Array.isArray(v.originCover?.urlList)&&v.originCover.urlList[0])return v.originCover.urlList[0];
        if(Array.isArray(v.origin_cover?.url_list)&&v.origin_cover.url_list[0])return v.origin_cover.url_list[0];
        if(isObj(v.cover)){const u=v.cover.urlList?.[0]||v.cover.url_list?.[0];if(u)return u;}
        if(typeof v.cover==='string'&&v.cover)return v.cover;
    }
    if(Array.isArray(d?.cover?.url_list)&&d.cover.url_list[0])return d.cover.url_list[0];
    if(v){
        if(Array.isArray(v.dynamicCover?.urlList)&&v.dynamicCover.urlList[0])return v.dynamicCover.urlList[0];
        if(Array.isArray(v.dynamic_cover?.url_list)&&v.dynamic_cover.url_list[0])return v.dynamic_cover.url_list[0];
    }
    if(d?.videoInfoRes?.item_list?.[0]?.video?.cover?.url_list?.[0])return d.videoInfoRes.item_list[0].video.cover.url_list[0];
    return null;
}

function pickImageUrl(img) {
    let raw='';
    if(Array.isArray(img.urlList)&&typeof img.urlList[0]==='string')raw=img.urlList[0];
    else if(Array.isArray(img.url_list)&&typeof img.url_list[0]==='string')raw=img.url_list[0];
    else if(Array.isArray(img.url_list)&&img.url_list.length){const l=img.url_list[img.url_list.length-1];raw=typeof l==='string'?l:'';}
    return raw?toHttps(raw):null;
}

function extractLivePhotoVideo(videoInfo) {
    let liveVideoUrl=null, v26Candidate=null;
    if(Array.isArray(videoInfo.playAddr)){
        for(const addr of videoInfo.playAddr){
            if(!isObj(addr)||typeof addr.src!=='string')continue;
            if(addr.src.includes('v3-web')){liveVideoUrl=addr.src;break;}
            if(!v26Candidate&&addr.src.includes('v26-web'))v26Candidate=addr.src;
        }
        if(!liveVideoUrl&&v26Candidate)liveVideoUrl=v26Candidate.replace(/:\/\/([^/]+)/,'://v26-luna.douyinvod.com');
        if(!liveVideoUrl){
            if(isObj(videoInfo.playAddr[1])&&typeof videoInfo.playAddr[1].src==='string')liveVideoUrl=videoInfo.playAddr[1].src;
            else if(isObj(videoInfo.playAddr[0])&&typeof videoInfo.playAddr[0].src==='string')liveVideoUrl=videoInfo.playAddr[0].src;
        }
    }
    if(!liveVideoUrl&&isObj(videoInfo.play_addr)&&Array.isArray(videoInfo.play_addr.url_list)){
        let v26=null;
        for(const c of videoInfo.play_addr.url_list){
            if(typeof c!=='string')continue;
            if(c.includes('v3-web')){liveVideoUrl=c;break;}
            if(!v26&&c.includes('v26-web'))v26=c;
        }
        if(!liveVideoUrl&&v26)liveVideoUrl=v26.replace(/:\/\/([^/]+)/,'://v26-luna.douyinvod.com');
        if(!liveVideoUrl){
            if(typeof videoInfo.play_addr.url_list[1]==='string')liveVideoUrl=videoInfo.play_addr.url_list[1];
            else if(typeof videoInfo.play_addr.url_list[0]==='string')liveVideoUrl=videoInfo.play_addr.url_list[0];
        }
    }
    if(!liveVideoUrl&&typeof videoInfo.playApi==='string'&&videoInfo.playApi)liveVideoUrl=videoInfo.playApi;
    return liveVideoUrl||null;
}

function extractHighestQualityVideo(detail) {
    const video=isObj(detail?.video)?detail.video:{};
    let bitRateList=null;
    if(Array.isArray(video.bitRateList)&&video.bitRateList.length)bitRateList=[...video.bitRateList];
    else if(Array.isArray(video.bit_rate)&&video.bit_rate.length)bitRateList=[...video.bit_rate];
    let url=null, backup=[];
    if(bitRateList){
        bitRateList.sort((a,b)=>(Number(b.bitRate||b.bit_rate||0))-(Number(a.bitRate||a.bit_rate||0)));
        for(const rateItem of bitRateList){
            if(!isObj(rateItem))continue;
            const candidates=[];
            if(Array.isArray(rateItem.playAddr))for(const item of rateItem.playAddr)if(isObj(item)&&item.src)candidates.push(item.src);
            if(!candidates.length&&isObj(rateItem.play_addr)&&Array.isArray(rateItem.play_addr.url_list))for(const item of rateItem.play_addr.url_list)if(typeof item==='string'&&item)candidates.push(item);
            if(!candidates.length)continue;
            let v3Link=null, v26Link=null;
            for(const c of candidates){
                if(c.includes('v3-web')){v3Link=c;break;}
                if(!v26Link&&c.includes('v26-web'))v26Link=c;
            }
            const currentBest=v3Link||(v26Link?v26Link.replace(/:\/\/([^/]+)/,'://v26-luna.douyinvod.com'):candidates[0]);
            if(!url)url=currentBest;
            for(let c of candidates){
                if(c.includes('v26-web'))c=c.replace(/:\/\/([^/]+)/,'://v26-luna.douyinvod.com');
                if(c!==url&&!backup.includes(c))backup.push(c);
            }
            if(url&&backup.length)break;
        }
    }
    if(!url){
        let uri=str(video.uri)||(isObj(video.play_addr)&&video.play_addr.uri?String(video.play_addr.uri):'');
        let playApi=typeof video.playApi==='string'&&video.playApi?video.playApi:'';
        if(!playApi&&isObj(video.play_addr)&&Array.isArray(video.play_addr.url_list)&&typeof video.play_addr.url_list[0]==='string')playApi=video.play_addr.url_list[0];
        if(playApi)url=playApi.replace(/playwm/g,'play');
        else if(uri)url=`https://aweme.snssdk.com/aweme/v1/play/?video_id=${uri}&ratio=720p&line=0`;
        const urlList=isObj(video.play_addr)&&Array.isArray(video.play_addr.url_list)?video.play_addr.url_list:[];
        if(urlList.length>1)urlList.forEach((link,i)=>{if(i===0||typeof link!=='string')return;const c=link.replace(/playwm/g,'play');if(c&&c!==url&&!backup.includes(c))backup.push(c);});
    }
    return {url,backup};
}

function buildData(detail, fallbackId) {
    const title=str(detail?.desc||'');
    const authorArr=isObj(detail?.author)?detail.author:{};
    const avatarThumb=isObj(authorArr.avatar_thumb)?authorArr.avatar_thumb:{};
    const avatars=Array.isArray(avatarThumb.url_list)?avatarThumb.url_list:[];
    const author={name:str(authorArr.nickname),id:str(authorArr.uid||authorArr.unique_id||authorArr.short_id),avatar:str(avatars[0]||'')};
    const music=isObj(detail?.music)?detail.music:{};
    const musicPlay=isObj(music.play_url)?music.play_url:{};
    const musicCoverSource=isObj(music.cover_thumb)?music.cover_thumb:isObj(music.cover_thumb_medium)?music.cover_thumb_medium:{};
    const musicOut={title:str(music.title||music.music_name||''),author:str(music.author||music.owner_nickname||''),url:toHttps(str(Array.isArray(musicPlay.url_list)?musicPlay.url_list[0]:''))||'',cover:toHttps(str(Array.isArray(musicCoverSource.url_list)?musicCoverSource.url_list[0]:''))||''};
    const video=isObj(detail?.video)?detail.video:null;
    const duration=video&&Number.isFinite(Number(video.duration))?Number(video.duration):null;
    const result={type:'unknown',title,desc:title,author,cover:'',url:null,duration,video_backup:[],images:[],live_photo:[],music:musicOut};
    let images=Array.isArray(detail?.images)?detail.images:[];
    if(!images.length&&Array.isArray(detail?.image_list))images=detail.image_list;
    if(images.length){
        result.type='image';
        for(const img of images){
            if(!isObj(img))continue;
            const imgUrl=pickImageUrl(img);
            if(imgUrl)result.images.push(imgUrl);
            const videoInfo=isObj(img.video)?img.video:{};
            let lpUrl=extractLivePhotoVideo(videoInfo);
            if(lpUrl)lpUrl=toHttps(lpUrl.replace(/playwm/g,'play'))||'';
            if(imgUrl&&lpUrl)result.live_photo.push({image:imgUrl,video:lpUrl});
        }
        if(result.live_photo.length)result.type='live';
    } else {
        result.type='video';
        const v=extractHighestQualityVideo(detail);
        if(v.url)result.url=toHttps(v.url.replace(/playwm/g,'play'));
        result.video_backup=v.backup.map(c=>toHttps(c.replace(/playwm/g,'play'))||'');
        if(video&&isObj(video.play_addr)&&video.play_addr.uri)result.video_id=String(video.play_addr.uri);
        else result.video_id=fallbackId||'';
    }
    const cover=pickCover(detail);
    result.cover=cover?toHttps(cover)||'':'';
    return result;
}

async function parseDouyinShare(shareText) {
    const url=extractUrl(shareText);
    if(!url) return {code:400,msg:'未在文本中识别到有效链接',data:{}};

    // follow redirect
    const realUrl=await followRedirect(url);
    if(!realUrl) return {code:400,msg:'无法解析重定向',data:{}};

    const vid=extractVideoId(realUrl);
    if(!vid) return {code:400,msg:`链接格式错误，无法提取ID。处理后的链接: ${realUrl}`,data:{}};

    // get ttwid
    let ttwid=await getTtwid();
    if(!ttwid) ttwid="1%7CvDWCB8tYdKPbdOlqwNTkDPhizBaV9i91KjYLKJbqurg%7C1723536402%7C314e63000decb79f46b8ff255560b29f4d8c57352dad465b41977db4830b4c7e";

    const msToken=randomMsToken(107);
    const params=new URLSearchParams({device_platform:'webapp',aid:'6383',channel:'channel_pc_web',aweme_id:vid,msToken});
    const query=params.toString();
    const aBogus=generate_a_bogus(query,UA);
    if(!aBogus) return {code:500,msg:'a_bogus签名失败',data:{}};

    const finalUrl=`https://www.douyin.com/aweme/v1/web/aweme/detail/?${query}&a_bogus=${encodeURIComponent(aBogus)}`;
    const refererBase=`https://www.douyin.com/video/${vid}`;

    // first warmup request
    await httpGet(`${refererBase}?previous_page=web_code_link`,{'User-Agent':UA,'Referer':'https://www.douyin.com/','Accept':'text/html,*/*'}).catch(()=>{});

    let body;
    try {
        const r=await httpGet(finalUrl,{
            'User-Agent':UA,
            'Accept':'application/json, text/plain, */*',
            'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer':`${refererBase}?previous_page=web_code_link`,
            'Cookie':`ttwid=${ttwid}`,
            'sec-ch-ua':'"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
            'sec-ch-ua-mobile':'?0',
            'sec-ch-ua-platform':'"Windows"',
            'sec-fetch-dest':'empty',
            'sec-fetch-mode':'cors',
            'sec-fetch-site':'same-origin',
        });
        body=r.body;
    } catch(e) {
        return {code:500,msg:`请求失败: ${e.message}`,data:{}};
    }

    let json;
    try { json=JSON.parse(body); } catch {
        return {code:500,msg:'接口返回非JSON（可能被WAF拦截）',data:{}};
    }

    if(!json||!json.aweme_detail) {
        const msg=json?.status_msg||json?.statusMsg||'';
        return {code:404,msg:msg?`解析失败: ${msg}`:'解析失败，未找到有效内容',data:{}};
    }

    const payload=buildData(json.aweme_detail, vid);
    return {code:200,msg:'解析成功',data:payload};
}

// ============ Video download endpoint ============
async function downloadVideo(req, res) {
    const urlObj = new URL(req.url, 'http://localhost');
    const videoUrl = urlObj.searchParams.get('url');
    const filename = urlObj.searchParams.get('filename') || 'video.mp4';

    if (!videoUrl) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({code: 400, msg: 'url参数为空'}));
        return;
    }

    try {
        const parsedUrl = new URL(videoUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const protocol = isHttps ? require('https') : require('http');

        const options = {
            rejectUnauthorized: false,
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.douyin.com/',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
            }
        };

        protocol.get(videoUrl, options, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                const redirectUrl = new URL(response.headers.location, videoUrl);
                const redirectProtocol = redirectUrl.protocol === 'https:' ? require('https') : require('http');
                const redirectOptions = {
                    ...options,
                    rejectUnauthorized: false,
                };
                redirectProtocol.get(redirectUrl.href, redirectOptions, (redirectResp) => {
                    res.writeHead(200, {
                        'Content-Type': 'video/mp4',
                        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
                        'Content-Length': redirectResp.headers['content-length'] || '',
                        'Transfer-Encoding': 'chunked',
                    });
                    redirectResp.pipe(res);
                }).on('error', (e) => {
                    res.writeHead(500, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({code: 500, msg: e.message}));
                });
            } else {
                res.writeHead(200, {
                    'Content-Type': 'video/mp4',
                    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
                    'Content-Length': response.headers['content-length'] || '',
                    'Transfer-Encoding': 'chunked',
                });
                response.pipe(res);
            }
        }).on('error', (e) => {
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({code: 500, msg: e.message}));
        });
    } catch (e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({code: 400, msg: e.message}));
    }
}

// ============ HTTP Server ============
const server=http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/json; charset=utf-8');

    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}

    if(req.url==='/'||req.url==='/health'){
        res.writeHead(200);res.end(JSON.stringify({status:'ok'}));return;
    }

    // Video download proxy endpoint
    if(req.url.startsWith('/download') || (req.method==='GET' && new URL(req.url,'http://localhost').searchParams.has('dl'))){
        await downloadVideo(req, res);
        return;
    }

    let body='';
    req.on('data',c=>body+=c);
    req.on('end',async ()=>{
        try {
            let url='';
            if(req.method==='GET'){
                const u=new URL(req.url,'http://localhost');
                url=u.searchParams.get('url')||'';
            } else if(req.method==='POST'){
                const ct=(req.headers['content-type']||'');
                if(ct.includes('application/json')){
                    const j=JSON.parse(body);
                    url=(j&&typeof j.url==='string')?j.url:'';
                } else if(ct.includes('application/x-www-form-urlencoded')||ct.includes('multipart/form-data')){
                    const {URLSearchParams:UP}=require('url');
                    const p=new UP(body);
                    url=p.get('url')||'';
                } else {
                    url=extractUrl(body)||'';
                }
            }
            if(!url){res.writeHead(200);res.end(JSON.stringify({code:400,msg:'url参数为空',data:{}}));return;}
            const result=await parseDouyinShare(url);
            res.writeHead(200);
            res.end(JSON.stringify(result));
        } catch(e) {
            res.writeHead(200);
            res.end(JSON.stringify({code:500,msg:`服务异常: ${e.message}`,data:{}}));
        }
    });
});

const PORT=3456;
server.listen(PORT,()=>{
    console.log(`Douyin signer service running at http://localhost:${PORT}`);
    console.log('Usage: GET /?url=xxx or POST with url in body');
});
