
export enum ContentBlockTypes{
    text = "Text",
    image = "Image",
    audio = "Audio",
    multipleChoice = "Multiple Choice",
    fillBlank = "Fill in the Blank",
    listenChoose = "Listen and Choose",
    //Keep last: InstantiateBlockOptions drops the last key from the type picker.
    pendingSelection = "Pending Selection",
}

//----------------------------------------------------------------------------
// One value shape per block type.
//
// To add a block type: write its value interface, add a line to
// ContentBlockValues, and add its empty value to emptyValueFor. The compiler
// then fails anywhere that has not handled the new type. A question block also
// goes in QUESTION_BLOCK_TYPES, which is what makes content a quiz.
//----------------------------------------------------------------------------

export interface $TextBlockValue{
    title:string;
    text:string;
}

export interface $ImageBlockValue{
    //Shown under the image as its caption.
    title:string;
    //Relative link returned by the upload, e.g. /uploads/images/<file>.png
    fileUrl:string;
    //Read by screen readers in place of the image.
    altText:string;
}

export interface $AudioBlockValue{
    title:string;
    //Relative link returned by the upload, e.g. /uploads/audio/<file>.mp3
    fileUrl:string;
    transcript:string;
}

//A question: one prompt, a list of answers to pick from, and which one is right.
export interface $MultipleChoiceBlockValue{
    //Shown above the question, the same as any other block's heading.
    title:string;
    //What the learner is asked.
    question:string;
    //The answers offered, in the order they are shown. Two at the least.
    options:string[];
    //Position in options of the right answer. Never sent to a learner.
    correctOption:number;
}

//A sentence with a word taken out of it, and the words that fill the gap.
export interface $FillBlankBlockValue{
    //Shown above the sentence, the same as any other block's heading.
    title:string;
    //The sentence, with [] marking where the missing word goes.
    sentence:string;
    //Every spelling counted as right. Never sent to a learner.
    accepted:string[];
}

//A clip, and a list of answers about what was said in it.
export interface $ListenChooseBlockValue{
    //Shown above the player, the same as any other block's heading.
    title:string;
    //Relative link returned by the upload, e.g. /uploads/audio/<file>.mp3
    fileUrl:string;
    //Everything said in the clip. Read by anyone who cannot hear it.
    transcript:string;
    //The answers offered, in the order they are shown. Two at the least.
    options:string[];
    //Position in options of the right answer. Never sent to a learner.
    correctOption:number;
}

//What an author types in a fill in the blank sentence to mark the gap.
export const BLANK_MARKER = '[]';

//What a learner receives for each question: the value without its answer. The
//server takes the answers out before content reaches a learner (see
//withholdAnswers.ts on the backend), so these are all a learner-facing
//component can count on.
export type $LearnerMultipleChoiceValue = Omit<$MultipleChoiceBlockValue, 'correctOption'>;
export type $LearnerFillBlankValue = Omit<$FillBlankBlockValue, 'accepted'>;
//A listening question's transcript is the spoken answer, so a learner taking a
//test or the challenge is not sent it; the author's preview and the moderator
//still have it.
export type $LearnerListenChooseValue = Omit<$ListenChooseBlockValue, 'correctOption' | 'transcript'> & { transcript?: string };

//A block with no type holds nothing.
export interface $PendingBlockValue{}

export interface ContentBlockValues{
    [ContentBlockTypes.text]:$TextBlockValue;
    [ContentBlockTypes.image]:$ImageBlockValue;
    [ContentBlockTypes.audio]:$AudioBlockValue;
    [ContentBlockTypes.multipleChoice]:$MultipleChoiceBlockValue;
    [ContentBlockTypes.fillBlank]:$FillBlankBlockValue;
    [ContentBlockTypes.listenChoose]:$ListenChooseBlockValue;
    [ContentBlockTypes.pendingSelection]:$PendingBlockValue;
}

//Returns a new, empty value for a block type.
export function emptyValueFor<T extends ContentBlockTypes>(type:T):ContentBlockValues[T]{
    const empties:ContentBlockValues = {
        [ContentBlockTypes.text]: {title:'', text:''},
        [ContentBlockTypes.image]: {title:'', fileUrl:'', altText:''},
        [ContentBlockTypes.audio]: {title:'', fileUrl:'', transcript:''},
        //Starts with the two empty options a question needs at the least.
        [ContentBlockTypes.multipleChoice]: {title:'', question:'', options:['',''], correctOption:0},
        [ContentBlockTypes.fillBlank]: {title:'', sentence:'', accepted:['']},
        [ContentBlockTypes.listenChoose]: {title:'', fileUrl:'', transcript:'', options:['',''], correctOption:0},
        [ContentBlockTypes.pendingSelection]: {},
    };
    return empties[type];
}

//One block: its type and a value shaped for that type. Blocks are addressed by
//page and position; only the whole content has an id.
export class $ContentBlock<T extends ContentBlockTypes = ContentBlockTypes>{
    itemType:T;
    value:ContentBlockValues[T];
    //Creates a block of a type with its value.
    constructor(itemType:T, value:ContentBlockValues[T]){
        this.itemType = itemType;
        this.value = value;
    }
}

//Whether a block is of a type. Narrows the block so its value is typed.
export function isBlockOfType<T extends ContentBlockTypes>(
    block:$ContentBlock|undefined, type:T):block is $ContentBlock<T>{
    return block?.itemType === type;
}

//Block types that make content a quiz: any one of them anywhere in the pages.
export const QUESTION_BLOCK_TYPES:readonly ContentBlockTypes[] = [
    ContentBlockTypes.multipleChoice,
    ContentBlockTypes.fillBlank,
    ContentBlockTypes.listenChoose,
];

//Derived from the blocks, never picked by the author.
export type ContentKind = 'story' | 'quiz';

export type ContentStatus = 'draft' | 'pending' | 'approved' | 'rejected';

//The languages content can teach. The same words as the learner's target language.
export const CONTENT_LANGUAGES = ['english', 'zulu'] as const;
export type ContentLanguage = typeof CONTENT_LANGUAGES[number];

//The levels content is written for, and learners are placed at. The labels are the common reference names; the
//numbers are levels.level_number in the taxonomy tables.
export const CONTENT_LEVELS = [
    {value:1, label:'A1'},
    {value:2, label:'A1+'},
    {value:3, label:'A2'},
    {value:4, label:'B1'},
    {value:5, label:'B2'},
    {value:6, label:'C1'},
] as const;

//The languages content can be written in, with the label shown beside each.
export const CONTENT_LANGUAGE_OPTIONS:ReadonlyArray<{value:ContentLanguage; label:string}> = [
    {value:'english', label:'English'},
    {value:'zulu', label:'isiZulu'},
];

//The whole content as the server stores and returns it. The pages and blocks are JSON inside content.
export interface $ContentRecord{
    contentId:number;
    authorId:number;
    title:string;
    language:ContentLanguage|null;
    childFriendly:boolean;
    status:ContentStatus;
    //Which submission this is: 0 until first submitted, then one more each time,
    //so content resubmitted after a rejection is version 2.
    version:number;
    level:number|null;
    chosenTags:string[];
    kind:ContentKind;
    content:$ContentBlock[][];
    updatedAt:string;
    submittedAt:string|null;
    //The author's display name, for a byline. Sent with a single record; a
    //list row (below) always has it.
    authorName?:string;
}

//One row of a list: what a dashboard, review queue or explore screen shows without
//loading the pages themselves.
export interface $ContentSummary extends Omit<$ContentRecord, 'content'>{
    authorName:string;
    //Only on the learner list: true when the content is above the learner's
    //level. The server refuses to open it, so Explore shows it without a link.
    locked?:boolean;
}

//Saved while drafting. Only content is required; the rest is filled in as the author goes.
//A field left out keeps what was saved; a null level or an empty tag list clears it.
export interface $ContentDraft{
    content:$ContentBlock[][];
    title?:string;
    language?:ContentLanguage|null;
    childFriendly?:boolean;
    level?:number|null;
    //In the author's order: the first is the theme.
    chosenTags?:string[];
}

//Sent to submit a draft for review. kind is derived by the server, so it is not sent.
export interface $ContentSubmission{
    content:$ContentBlock[][];
    title:string;
    language:ContentLanguage;
    childFriendly:boolean;
    level:number;
    chosenTags:string[];
}

//What a learner-facing list may be narrowed by.
export interface $ApprovedContentFilter{
    level?:number;
    language?:ContentLanguage;
    childFriendlyOnly?:boolean;
}
