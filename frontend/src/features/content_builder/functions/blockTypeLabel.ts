import { translate } from "@/features/content_builder/functions/translate";
import { ContentBlockTypes } from "@/features/shared/models/contentType";

//The enum values are stored data ('Multiple Choice'), not labels: each one is shown
//by its shared name in common.blockTypes, in the interface language.
const BLOCK_TYPE_KEYS:Record<ContentBlockTypes, string> = {
    [ContentBlockTypes.text]: 'common.blockTypes.text',
    [ContentBlockTypes.image]: 'common.blockTypes.image',
    [ContentBlockTypes.audio]: 'common.blockTypes.audio',
    [ContentBlockTypes.multipleChoice]: 'common.blockTypes.multipleChoice',
    [ContentBlockTypes.fillBlank]: 'common.blockTypes.fillBlank',
    [ContentBlockTypes.listenChoose]: 'common.blockTypes.listenChoose',
    [ContentBlockTypes.pendingSelection]: 'builder.blocks.chooseType',
};

//The name of a block type as a person reads it. Called at render time, so it
//follows the interface language.
export function blockTypeLabel(type:ContentBlockTypes):string{
    const key = BLOCK_TYPE_KEYS[type];
    return key ? translate(key) : String(type);
}
