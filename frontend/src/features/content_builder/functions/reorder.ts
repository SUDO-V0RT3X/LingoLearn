//Returns the index a block at from ends up at when dropped into gap insertAt of a
//list of length blocks (gap 0 is above the first, gap length below the last).
//Returns null when from is out of range or the drop leaves the block where it is.
export function dropTargetIndex(from:number, insertAt:number, length:number):number|null{
    if (from < 0 || from >= length) return null;
    const target = insertAt > from ? insertAt - 1 : insertAt;
    if (target < 0 || target >= length || target == from) return null;
    return target;
}
