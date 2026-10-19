import { BLANK_MARKER, ContentBlockTypes, QUESTION_BLOCK_TYPES, isBlockOfType,
         type $ContentBlock, type ContentKind, type ContentLanguage } from "@/features/shared/models/contentType";
import { validateTheme, validateAudience, validateTagLimit } from "@/features/media_feature/functions/validateTaxonomy";
import { MAX_TAGS_PER_CONTENT } from "@/features/media_feature/models/TaxonomyTypes";
import { translate } from "@/features/content_builder/functions/translate";

//Whether a tag is one the taxonomy offers. Case sensitive: "Travel" is not "travel".
export function isAvailableTag(tag:string, availableTags:readonly string[]):boolean{
    return availableTags.includes(tag);
}

//Returns 'quiz' if any block is a question type, otherwise 'story'.
export function deriveContentKind(
    pages:$ContentBlock[][], questionTypes:readonly ContentBlockTypes[] = QUESTION_BLOCK_TYPES):ContentKind{
    const hasQuestion = pages.some(page => page.some(block => questionTypes.includes(block.itemType)));
    return hasQuestion ? 'quiz' : 'story';
}

/**
 * Whether a set of answers is one a learner could actually be asked. Two of
 * them have to be filled in, none may repeat another, and the marked one has
 * to be one of the filled in ones. Answers are compared without case, because
 * two that differ only in case read as the same answer on the screen.
 */
export function answersAreUsable(options:readonly string[], correctOption:number):boolean{
    const filled = options.map(option => option.trim()).filter(option => option !== '');
    if (filled.length < 2) return false;
    if (new Set(filled.map(option => option.toLowerCase())).size !== filled.length) return false;
    return Number.isInteger(correctOption)
        && correctOption >= 0 && correctOption < options.length
        && options[correctOption].trim() !== '';
}

export interface SubmissionCheck{
    //Stable name of the check, whatever the interface language.
    key:string;
    //What the check asks, in the interface language when it was run.
    label:string;
    passed:boolean;
}

//Labels are read on every call, so a list built inside a computed follows the
//interface language when it changes.
//A check's label in the interface language.
function label(key:string, params:Record<string, string | number> = {}):string{
    return translate('builder.checks.' + key, params);
}

//Builds one check, its label looked up from its key.
function check(key:string, passed:boolean, params:Record<string, string | number> = {}):SubmissionCheck{
    return {key, label: label(key, params), passed};
}

//What the author has set besides the pages themselves.
export interface SubmissionDetails{
    title:string;
    language:ContentLanguage|null;
    level:number|null;
    theme?:string|string[]|null;
    audience?:string|null;
    chosenTags?:string[];
}

//Whether one block is filled in enough to be submitted, by the rules for its type.
function blockIsComplete(block:$ContentBlock):boolean{
    if (isBlockOfType(block, ContentBlockTypes.text))
        return block.value.title.trim() !== '' && block.value.text.trim() !== '';
    if (isBlockOfType(block, ContentBlockTypes.image))
        return block.value.fileUrl.trim() !== '' && block.value.altText.trim() !== '';
    if (isBlockOfType(block, ContentBlockTypes.audio))
        return block.value.fileUrl.trim() !== '' && block.value.transcript.trim() !== '';
    if (isBlockOfType(block, ContentBlockTypes.multipleChoice))
        return block.value.question.trim() !== ''
            && answersAreUsable(block.value.options, block.value.correctOption);
    if (isBlockOfType(block, ContentBlockTypes.fillBlank))
        return block.value.sentence.trim() !== ''
            && block.value.sentence.split(BLANK_MARKER).length === 2
            && block.value.accepted.some(answer => answer.trim() !== '');
    if (isBlockOfType(block, ContentBlockTypes.listenChoose))
        return block.value.fileUrl.trim() !== '' && block.value.transcript.trim() !== ''
            && answersAreUsable(block.value.options, block.value.correctOption);
    return block.itemType !== ContentBlockTypes.pendingSelection;
}

//The check each block type answers to, so a failing block can be traced to its check.
const BLOCK_CHECK_KEYS:Record<ContentBlockTypes, string> = {
    [ContentBlockTypes.text]: 'textBlocks',
    [ContentBlockTypes.image]: 'images',
    [ContentBlockTypes.audio]: 'audio',
    [ContentBlockTypes.multipleChoice]: 'multipleChoice',
    [ContentBlockTypes.fillBlank]: 'fillBlank',
    [ContentBlockTypes.listenChoose]: 'listenChoose',
    [ContentBlockTypes.pendingSelection]: 'blocksHaveType',
};

//The key of the check a block fails, or null when it is ready. The submit screen
//uses it to mark the very block that needs work.
export function blockProblem(block:$ContentBlock):string|null{
    return blockIsComplete(block) ? null : BLOCK_CHECK_KEYS[block.itemType] ?? 'blocksHaveType';
}

//Returns every check a draft must pass before submitting, each marked passed or not.
//The server runs the same checks; these are what the submit screen shows.
export function submissionChecks(pages:$ContentBlock[][], details:SubmissionDetails):SubmissionCheck[]{
    const blocks = pages.flat();
    const problems = new Set(blocks.map(blockProblem));
    return [
        check('title', details.title.trim() !== ''),
        check('language', details.language !== null),
        check('level', details.level !== null),
        check('theme', validateTheme(details.theme) === null),
        check('audience', validateAudience(details.audience) === null),
        check('tagLimit', validateTagLimit(details.chosenTags ?? (details.theme ? (Array.isArray(details.theme) ? details.theme : [details.theme]) : [])) === null,
              {max: MAX_TAGS_PER_CONTENT}),
        check('pagesHaveBlocks',
          pages.length > 0 && pages.every(page => page.length > 0)),
        check('blocksHaveType', !problems.has('blocksHaveType')),
        check('textBlocks', !problems.has('textBlocks')),
        check('images', !problems.has('images')),
        check('audio', !problems.has('audio')),
        check('multipleChoice', !problems.has('multipleChoice')),
        check('fillBlank', !problems.has('fillBlank'), {marker: BLANK_MARKER}),
        check('listenChoose', !problems.has('listenChoose')),
    ];
}

