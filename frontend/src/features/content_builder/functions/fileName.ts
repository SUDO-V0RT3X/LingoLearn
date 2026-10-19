//Returns the file name at the end of a link, without its query or fragment:
//".../uploads/audio/clip.mp3?v=2" gives "clip.mp3". A blank link gives "".
export function fileNameFromUrl(url:string):string{
    const path = url.trim().split(/[?#]/)[0];
    const name = path.split('/').filter(part => part !== '').pop() ?? '';
    try{
        return decodeURIComponent(name);
    }catch{
        return name;
    }
}
