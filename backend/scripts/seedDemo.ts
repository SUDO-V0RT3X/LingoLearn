// LIN-81: Comprehensive seed script for demo data
// Seeds users of every role, learner settings, parent-child linking,
// CEFR reading levels, vocabulary tags, sample multi-lifecycle content, approved
// tests at every level (at least six child-friendly ones per language at levels
// 1 to 5, so anyone can level up), and level 1 tests already passed by each demo
// learner, one short of the level-up challenge.
// Idempotent: running it again updates what is there and adds nothing twice.
// Run directly with: npm run seed
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from '../src/config/db/db_init.js';
import { PasswordMethods } from '../src/routes/api/routes.api/authRoutes/methods/passwordMethods.js';
import type { UserRole } from '../src/routes/api/routes.api/authRoutes/types/authType.js';
import type { ContentPages } from '../src/routes/api/routes.api/contentRoutes/types/contentType.js';
import { mediaDirectory } from '../src/routes/api/routes.api/mediaRoutes/functions/mediaStorage.js';
import { gradeAnswers, questionBlocksOf, type Answer } from '../src/shared/grading.js';
import { TESTS_REQUIRED_PER_LEVEL } from '../src/shared/levelRules.js';

export interface UserSeedConfig {
    role: UserRole;
    firstName: string;
    lastName: string;
    email: string | null;
    username: string | null;
    requiresGuardianLink?: boolean;
}

export interface LevelSeedConfig {
    levelNumber: number;
    name: string;
    description: string;
    passMark: number;
}

export interface TagSeedConfig {
    name: string;
    tagType: 'theme' | 'test';
    description: string;
}

export interface ContentSeedItem {
    title: string;
    language: 'english' | 'zulu';
    level: number;
    childFriendly: boolean;
    status: 'draft' | 'pending' | 'approved' | 'rejected';
    submittedAt?: Date;
    pages: Array<Array<{ itemType: string; value: Record<string, unknown> }>>;
    tags: string[];
    moderationReview?: {
        decision: 'approved' | 'rejected';
        reason?: string;
    };
}

export interface SeedSummary {
    usersCreated: number;
    levelsSeeded: number;
    tagsSeeded: number;
    contentItemsSeeded: number;
    reviewsCreated: number;
    attemptsCreated: number;
}

export const SEED_USERS: UserSeedConfig[] = [
    { role: 'administrator', firstName: 'One', lastName: 'Admin', email: 'one@admin.test', username: null },
    { role: 'moderator', firstName: 'One', lastName: 'Moderator', email: 'one@moderator.test', username: null },
    { role: 'author', firstName: 'One', lastName: 'Author', email: 'one@author.test', username: null },
    { role: 'learner', firstName: 'One', lastName: 'Learner', email: null, username: 'one_learner', requiresGuardianLink: false },
    { role: 'learner', firstName: 'Young', lastName: 'Learner', email: null, username: 'young_learner', requiresGuardianLink: true },
    { role: 'guardian', firstName: 'One', lastName: 'Guardian', email: 'one@guardian.test', username: null },
];

export const SEED_LEVELS: LevelSeedConfig[] = [
    { levelNumber: 1, name: 'Level 1: Absolute Beginner', description: 'Foundational phonics, basic vocabulary, and simple greetings', passMark: 70 },
    { levelNumber: 2, name: 'Level 2: Elementary Reader', description: 'Simple sentence structures and familiar everyday topics', passMark: 70 },
    { levelNumber: 3, name: 'Level 3: Intermediate Reader', description: 'Paragraph-length stories, descriptive narrative, and expanded vocabulary', passMark: 70 },
    { levelNumber: 4, name: 'Level 4: Advanced Reader', description: 'Complex compound sentences, abstract concepts, and cultural texts', passMark: 75 },
    { levelNumber: 5, name: 'Level 5: Fluent Reader', description: 'Unconstrained literature, nuanced grammar, and idiom comprehension', passMark: 80 },
    { levelNumber: 6, name: 'Level 6: Independent Reader', description: 'Full-length texts, register and tone, and independent study', passMark: 80 },
];

export const SEED_TAGS: TagSeedConfig[] = [
    { name: 'greetings', tagType: 'theme', description: 'Meeting people, introductions, and everyday courtesies' },
    { name: 'family', tagType: 'theme', description: 'Kinship, household roles, and family traditions' },
    { name: 'animals', tagType: 'theme', description: 'Domesticated pets, wildlife, and natural habitats' },
    { name: 'food', tagType: 'theme', description: 'Culinary culture, ingredients, dining out, and recipes' },
    { name: 'travel', tagType: 'theme', description: 'Navigating transport, directions, places, and journeys' },
    { name: 'culture', tagType: 'theme', description: 'Heritage, customs, celebrations, and music' },
    { name: 'nature', tagType: 'theme', description: 'The outdoors, landscapes, plants, and ecosystems' },
    { name: 'folklore', tagType: 'theme', description: 'Traditional tales, fables, and oral histories' },
    { name: 'school', tagType: 'theme', description: 'Classroom environment, study routines, and educational subjects' },
    { name: 'daily-life', tagType: 'theme', description: 'Routines, weather, shopping, and community interactions' },
    // The same rows as migrations/400_taxonomy.sql, listed so the tests below can use them.
    { name: 'numbers', tagType: 'theme', description: 'Counting, prices, dates, and quantities' },
    { name: 'shopping', tagType: 'theme', description: 'Markets, shops, money, and bargaining' },
    { name: 'directions', tagType: 'theme', description: 'Asking the way, landmarks, and giving instructions' },
    { name: 'weather', tagType: 'theme', description: 'Seasons, forecasts, and talking about the weather' },
    { name: 'conversation', tagType: 'theme', description: 'Small talk, opinions, and keeping a conversation going' },
    { name: 'vocabulary', tagType: 'theme', description: 'Word building, synonyms, and everyday word sets' },
    { name: 'listening', tagType: 'theme', description: 'Listening practice with recorded speech' },
    { name: 'quiz', tagType: 'test', description: 'Short formative quiz checking recent lesson topics' },
    { name: 'placement-test', tagType: 'test', description: 'Diagnostic test evaluating initial reader placement' },
    { name: 'practice-test', tagType: 'test', description: 'Ungraded practice assessment for self-study' },
    { name: 'review-test', tagType: 'test', description: 'Comprehensive unit or level checkpoint assessment' },
];

// Block builders, so each lesson and test below reads as its content.
type SeedBlock = { itemType: string; value: Record<string, unknown> };

const text = (title: string, body: string): SeedBlock => ({ itemType: 'Text', value: { title, text: body } });
const choice = (title: string, question: string, options: string[], correctOption: number): SeedBlock =>
    ({ itemType: 'Multiple Choice', value: { title, question, options, correctOption } });
const gap = (title: string, sentence: string, accepted: string[]): SeedBlock =>
    ({ itemType: 'Fill in the Blank', value: { title, sentence, accepted } });

// The demo clip every listening block plays: a copy of docs/MO/test1.mp3,
// which the seed puts in the uploads folder (see seedListeningClip below).
export const SEED_CLIP = {
    fixture: 'greeting.mp3',
    filename: 'seed-greeting.mp3',
    fileUrl: '/uploads/audio/seed-greeting.mp3',
    title: 'Sawubona, unjani?',
    transcript: 'Sawubona, unjani? (Hello, how are you?)',
};

const listen = (title: string, options: string[], correctOption: number): SeedBlock =>
    ({ itemType: 'Listen and Choose', value: { title, fileUrl: SEED_CLIP.fileUrl, transcript: SEED_CLIP.transcript, options, correctOption } });

// Lessons (stories) in every lifecycle status, for the author dashboard and the
// moderation queue. Each is labelled with the language it is written in.
const SEED_LESSONS: ContentSeedItem[] = [
    {
        title: 'Sawubona! Everyday Greetings in isiZulu',
        language: 'zulu',
        level: 1,
        childFriendly: true,
        status: 'approved',
        submittedAt: new Date('2026-09-20T10:00:00Z'),
        tags: ['greetings', 'family'],
        pages: [
            [text('Ukubingelela (Greeting)',
                'Sawubona! Igama lami nguSipho. Ngiyajabula ukukwazi. (Hello! My name is Sipho. I am pleased to meet you.)')],
            [text('Ukuphendula (Replying)',
                'Yebo, sawubona! Unjani namuhla? Ngiyaphila, ngiyabonga. Wena unjani? (Yes, hello! How are you today? I am well, thank you. And how are you?)')],
            [{ itemType: 'Audio', value: { title: 'Lalela (Listen)', fileUrl: SEED_CLIP.fileUrl, transcript: SEED_CLIP.transcript } }],
        ],
        moderationReview: { decision: 'approved' },
    },
    {
        title: 'Animals of the Kruger Park',
        language: 'english',
        level: 2,
        childFriendly: true,
        status: 'approved',
        submittedAt: new Date('2026-09-21T11:00:00Z'),
        tags: ['animals', 'nature', 'travel'],
        pages: [
            [text('The Great Safari',
                'The Kruger National Park is home to the famous Big Five: lions, leopards, rhinos, elephants, and buffalos.')],
            [text('Waterhole Morning',
                'At dawn, zebras and giraffes gather by the cool watering hole before the midday sun warms the savannah.')],
        ],
        moderationReview: { decision: 'approved' },
    },
    {
        title: 'Traditional South African Cooking',
        language: 'english',
        level: 3,
        childFriendly: true,
        status: 'approved',
        submittedAt: new Date('2026-09-22T09:30:00Z'),
        tags: ['food', 'culture'],
        pages: [
            [text('Potjiekos Traditions',
                'Cooking in a three-legged cast-iron pot over hot embers brings family and friends together for hours of sharing.')],
        ],
        moderationReview: { decision: 'approved' },
    },
    {
        title: 'The Clever Tortoise (Inganekwane)',
        language: 'zulu',
        level: 2,
        childFriendly: true,
        status: 'pending',
        submittedAt: new Date('2026-09-25T14:00:00Z'),
        tags: ['animals', 'folklore'],
        pages: [
            [text('Ufudu oluhlakaniphile (The clever tortoise)',
                'Kwasukasukela, kwakukhona ufudu oluhlala ehlathini elikhulu. Nakuba lwaluhamba kancane, lwaluhlakaniphe kakhulu kunazo zonke izilwane. (Once upon a time, there was a tortoise that lived in a big forest. Although it walked slowly, it was cleverer than all the other animals.)')],
        ],
    },
    {
        title: 'A Journey Across Cape Town',
        language: 'english',
        level: 2,
        childFriendly: true,
        status: 'pending',
        submittedAt: new Date('2026-09-25T16:00:00Z'),
        tags: ['travel', 'culture'],
        pages: [
            [text('Table Mountain Vistas',
                'Taking the cable car to the top gives you a panoramic view of the city, Robben Island, and the two oceans.')],
        ],
    },
    {
        title: 'Draft: Sounds of the Forest',
        language: 'zulu',
        level: 1,
        childFriendly: true,
        status: 'draft',
        tags: ['nature'],
        pages: [
            [text('Amanothi (Notes)',
                'Imisindo yehlathi: izinyoni ziyacula, umoya uyavunguza... (Sounds of the forest: the birds sing, the wind blows...)')],
        ],
    },
    {
        title: 'Advanced Scientific Colloquialisms',
        language: 'english',
        level: 1,
        childFriendly: false,
        status: 'rejected',
        submittedAt: new Date('2026-09-24T08:00:00Z'),
        tags: ['school'],
        pages: [
            [text('Thermodynamics Exposition',
                'An analytical disquisition on entropy and macroscopic thermodynamics in adiabatic isolated systems.')],
        ],
        moderationReview: {
            decision: 'rejected',
            reason: 'Vocabulary is far too advanced for Level 1 readers. Please simplify sentences and target age-appropriate themes.',
        },
    },
];

/** One approved test: a short text block, then its questions, on one page. */
function approvedTest(
    title: string, language: 'english' | 'zulu', level: number, childFriendly: boolean,
    tags: string[], submittedOn: string, blocks: SeedBlock[],
): ContentSeedItem {
    return {
        title, language, level, childFriendly, tags,
        status: 'approved',
        submittedAt: new Date(`${submittedOn}T09:00:00Z`),
        pages: [blocks],
        moderationReview: { decision: 'approved' },
    };
}

/** An approved, child-friendly test: what every level-up quiz below is. */
const quiz = (title: string, language: 'english' | 'zulu', level: number, tags: string[], submittedOn: string, blocks: SeedBlock[]) =>
    approvedTest(title, language, level, true, tags, submittedOn, blocks);

// Six child-friendly quizzes per language at every level from 1 to 5, well over
// TESTS_REQUIRED_PER_LEVEL, so any learner (child or adult, since adults see
// child-friendly content too) can level up with a choice of tests left over,
// plus a few at level 6 for the last level-up challenge. Each is a short text, then four questions (five at
// levels 5 and 6, whose pass mark is 80%), so one slip still passes up to level 4.
// They get harder level by level: words, then phrases, short stories, longer
// stories with tenses, then proverbs and idioms. The isiZulu questions are asked
// in English about simple isiZulu, with a translation beside every isiZulu text.
const LEVEL_UP_TESTS: ContentSeedItem[] = [
    // ---- Level 1, English ----
    quiz('Colours All Around', 'english', 1, ['vocabulary', 'nature'], '2026-10-05', [
        text('Colours', 'The sky is blue. The grass is green. A banana is yellow. A tomato is red.'),
        choice('Colours', 'What colour is the grass?', ['Green', 'Blue', 'Red'], 0),
        choice('Colours', 'What colour is a banana?', ['Red', 'Yellow', 'Blue'], 1),
        gap('Colours', 'The sky is [].', ['blue']),
        choice('Colours', 'Which one is red?', ['The sky', 'A tomato', 'The grass'], 1),
    ]),
    quiz('Counting to Ten', 'english', 1, ['numbers'], '2026-10-05', [
        text('Counting', 'One, two, three, four, five, six, seven, eight, nine, ten. I have two hands and ten fingers.'),
        choice('Counting', 'Which number comes after four?', ['Six', 'Three', 'Five'], 2),
        choice('My hands', 'How many hands do you have?', ['Two', 'One', 'Ten'], 0),
        gap('Counting', 'Seven, eight, [], ten.', ['nine', '9']),
        choice('My hands', 'How many fingers are on two hands?', ['Five', 'Ten', 'Eight'], 1),
    ]),
    quiz('My Pets', 'english', 1, ['animals'], '2026-10-05', [
        text('My pets', 'I have a dog and a cat. The dog says "woof". The cat says "meow". My dog likes to run. My cat likes to sleep.'),
        choice('Animal sounds', 'What does the cat say?', ['Woof', 'Meow', 'Moo'], 1),
        choice('My dog', 'What does the dog like to do?', ['Run', 'Sleep', 'Swim'], 0),
        gap('My cat', 'My cat likes to [].', ['sleep']),
        choice('Animal sounds', 'Which animal says "woof"?', ['The cat', 'The cow', 'The dog'], 2),
    ]),
    quiz('My Body', 'english', 1, ['vocabulary'], '2026-10-06', [
        text('My body', 'I see with my eyes. I hear with my ears. I smell with my nose. I walk with my feet.'),
        choice('Hearing', 'What do you hear with?', ['Your eyes', 'Your ears', 'Your feet'], 1),
        choice('Smelling', 'What do you smell with?', ['Your nose', 'Your hands', 'Your ears'], 0),
        gap('Seeing', 'I see with my [].', ['eyes']),
        choice('Walking', 'What do you walk with?', ['Your ears', 'Your nose', 'Your feet'], 2),
    ]),
    quiz('Breakfast Time', 'english', 1, ['food', 'daily-life'], '2026-10-06', [
        text('Breakfast', 'In the morning I eat porridge. I drink milk. Mum eats bread and drinks tea.'),
        choice('Breakfast', 'What do I eat in the morning?', ['Rice', 'Porridge', 'Cake'], 1),
        choice('Breakfast', 'What does Mum drink?', ['Tea', 'Milk', 'Juice'], 0),
        gap('Breakfast', 'I drink [].', ['milk']),
        choice('Breakfast', 'When do I eat porridge?', ['At night', 'In the afternoon', 'In the morning'], 2),
    ]),

    // ---- Level 2, isiZulu ----
    quiz('Izingubo: Clothes', 'zulu', 2, ['daily-life', 'weather'], '2026-10-05', [
        text('Izingubo (Clothes)',
            'ihembe (shirt), ibhulukwe (trousers), ijezi (jersey), isigqoko (hat), izicathulo (shoes). Kuyabanda, faka ijezi! (It is cold, put on a jersey!)'),
        choice('Izingubo', "What is 'isigqoko'?", ['Shoes', 'A hat', 'A shirt'], 1),
        choice('Kuyabanda', "'Kuyabanda, faka ijezi!' What should you put on?", ['A jersey', 'Shoes', 'A hat'], 0),
        gap('Izicathulo', 'Ngigqoka [] ezinyaweni zami. (I wear shoes on my feet.)', ['izicathulo']),
        choice('Izingubo', "Which word means 'shirt'?", ['ibhulukwe', 'ijezi', 'ihembe'], 2),
    ]),

    // ---- Level 2, English ----
    quiz('A Day at the Park', 'english', 2, ['daily-life', 'nature'], '2026-10-06', [
        text('At the park',
            'On Saturday, Lebo and her brother went to the park. They played on the swings and fed the ducks. When it got cold, they went home for soup.'),
        choice('At the park', 'Who went to the park with Lebo?', ['Her sister', 'Her brother', 'Her teacher'], 1),
        choice('At the park', 'What did they feed?', ['The ducks', 'The dogs', 'The fish'], 0),
        gap('At the park', 'They played on the [].', ['swings']),
        choice('Going home', 'Why did they go home?', ['They were tired', 'It got cold', 'It was dark'], 1),
    ]),
    quiz('The Weather Today', 'english', 2, ['weather'], '2026-10-06', [
        text('Sun and rain',
            'In the morning it was sunny and warm. In the afternoon, grey clouds came and it started to rain. Thabo took his umbrella and his raincoat.'),
        choice('The morning', 'What was the weather like in the morning?', ['Rainy', 'Sunny and warm', 'Windy'], 1),
        choice('The rain', 'When did it start to rain?', ['In the afternoon', 'In the morning', 'At night'], 0),
        choice('Thabo', 'What did Thabo take?', ['A hat and sunglasses', 'A ball', 'An umbrella and a raincoat'], 2),
        gap('The clouds', 'Grey [] came and it started to rain.', ['clouds']),
    ]),
    quiz('At the Shop', 'english', 2, ['shopping', 'numbers'], '2026-10-07', [
        text('Buying bread',
            'Nomsa has twenty rand. She buys a loaf of bread for fifteen rand. The shopkeeper gives her five rand change.'),
        choice('Money', 'How much money does Nomsa have?', ['Ten rand', 'Fifteen rand', 'Twenty rand'], 2),
        choice('Shopping', 'What does Nomsa buy?', ['Milk', 'A loaf of bread', 'Apples'], 1),
        gap('Change', 'The shopkeeper gives her five rand [].', ['change']),
        choice('Prices', 'How much does the bread cost?', ['Fifteen rand', 'Five rand', 'Twenty rand'], 0),
    ]),
    quiz('My School Day', 'english', 2, ['school'], '2026-10-07', [
        text('At school',
            'At school we read stories, write sentences and count numbers. At break we eat our lunch and play outside. Our teacher, Mr Dlamini, rings the bell when break is over.'),
        choice('The teacher', "What is the teacher's name?", ['Mr Dlamini', 'Mrs Khumalo', 'Mr Naidoo'], 0),
        choice('Break time', 'What happens at break?', ['We write sentences', 'We eat lunch and play outside', 'We go home'], 1),
        gap('The bell', 'Mr Dlamini rings the [] when break is over.', ['bell']),
        choice('At school', 'Which of these do they NOT do in the story?', ['Read stories', 'Count numbers', 'Swim'], 2),
    ]),
    quiz('Families Help Each Other', 'english', 2, ['family'], '2026-10-07', [
        text('Helping at home',
            'In my family everyone helps. Dad cooks supper. Grandma waters the garden. My sister and I wash the dishes after we eat.'),
        choice('Supper', 'Who cooks supper?', ['Mum', 'Dad', 'Grandma'], 1),
        choice('The garden', 'What does Grandma do?', ['She waters the garden', 'She washes the dishes', 'She cooks supper'], 0),
        gap('The dishes', 'My sister and I wash the [] after we eat.', ['dishes']),
        choice('The story', 'What is the story mostly about?', ['A birthday party', 'Everyone in the family helping', 'A trip to the sea'], 1),
    ]),

    // ---- Level 3, isiZulu: short stories ----
    quiz('Usuku LukaSipho: Sipho\'s Day', 'zulu', 3, ['daily-life', 'school'], '2026-10-08', [
        text('Usuku lukaSipho (Sipho\'s day)',
            'Ekuseni uSipho uvuka ngehora lesithupha. Uyageza, bese edla iphalishi. Uya esikoleni ngebhasi. Ntambama udlala ibhola nabangane bakhe. (In the morning Sipho wakes up at six o\'clock. He washes, then eats porridge. He goes to school by bus. In the afternoon he plays soccer with his friends.)'),
        choice('Ekuseni', 'What does Sipho eat in the morning?', ['Bread', 'Porridge', 'Rice'], 1),
        choice('Esikoleni', 'How does Sipho get to school?', ['By bus', 'On foot', 'By car'], 0),
        choice('Amagama', "What does 'ntambama' mean?", ['In the morning', 'At night', 'In the afternoon'], 2),
        gap('Ntambama', 'Ntambama udlala [] nabangane bakhe. (In the afternoon he plays soccer with his friends.)', ['ibhola']),
    ]),
    quiz('Imizwa: How Do You Feel?', 'zulu', 3, ['conversation', 'listening'], '2026-10-08', [
        text('Imizwa (Feelings)',
            'Ngijabulile. (I am happy.) Ngidabukile. (I am sad.) Ngilambile. (I am hungry.) Ngikhathele. (I am tired.) Uma umuntu ethi "Unjani?", ungathi "Ngiyaphila, ngiyabonga." (When someone says "How are you?", you can say "I am well, thank you.")'),
        choice('Imizwa', 'Thandi has not eaten all day. What does she say?', ['Ngilambile.', 'Ngijabulile.', 'Ngikhathele.'], 0),
        choice('Imizwa', "What does 'Ngikhathele' mean?", ['I am sad', 'I am tired', 'I am happy'], 1),
        listen('Lalela: how should you answer the speaker?', ['Ngiyaphila, ngiyabonga.', 'Igama lami nguThabo.', 'Hamba kahle.'], 0),
        gap('Ngijabulile', '[]! Ngithole izinkanyezi ezintathu. (I am happy! I got three stars.)', ['Ngijabulile']),
    ]),
    quiz('Epulazini: On the Farm', 'zulu', 3, ['animals', 'nature'], '2026-10-08', [
        text('Epulazini (On the farm)',
            'UGogo uhlala epulazini. Unezinkomo ezine, izimbuzi ezintathu nezinkukhu eziningi. Izinkukhu zibekela amaqanda. Izinkomo zisinika ubisi. (Grandmother lives on a farm. She has four cows, three goats and many chickens. The chickens lay eggs. The cows give us milk.)'),
        choice('Izinkomo', 'How many cows does Grandmother have?', ['Three', 'Four', 'Many'], 1),
        choice('Izilwane', "What are 'izimbuzi'?", ['Goats', 'Cows', 'Chickens'], 0),
        choice('Izinkukhu', 'What do the chickens give?', ['Milk', 'Wool', 'Eggs'], 2),
        gap('Ubisi', 'Izinkomo zisinika []. (The cows give us milk.)', ['ubisi']),
    ]),
    quiz('Esitolo: At the Shop', 'zulu', 3, ['shopping', 'numbers'], '2026-10-09', [
        text('Esitolo (At the shop)',
            'UThandi uya esitolo. Uthenga isinkwa nobisi. Isinkwa sibiza amarandi ayishumi nanhlanu, ubisi lubiza amarandi ayishumi. (Thandi goes to the shop. She buys bread and milk. The bread costs fifteen rand, the milk costs ten rand.)'),
        choice('Ukuthenga', 'What does Thandi buy?', ['Bread and milk', 'Eggs and rice', 'Tea and sugar'], 0),
        choice('Imali', 'How much does the milk cost?', ['Five rand', 'Ten rand', 'Fifteen rand'], 1),
        choice('Imali', 'How much does Thandi pay altogether?', ['Ten rand', 'Fifteen rand', 'Twenty-five rand'], 2),
        gap('Esitolo', 'UThandi uya []. (Thandi goes to the shop.)', ['esitolo']),
    ]),
    quiz('Isimo Sezulu Namuhla: Today\'s Weather', 'zulu', 3, ['weather', 'nature'], '2026-10-09', [
        text('Namuhla (Today)',
            'Namuhla kunamafu futhi umoya uyavunguza. Izulu lizokuna ntambama. Thatha isambulela sakho! (Today it is cloudy and the wind is blowing. It will rain in the afternoon. Take your umbrella!)'),
        choice('Isimo sezulu', 'What is the weather like today?', ['Hot and sunny', 'Cloudy and windy', 'Snowing'], 1),
        choice('Imvula', 'When will it rain?', ['In the morning', 'At night', 'In the afternoon'], 2),
        choice('Amagama', "What is 'isambulela'?", ['An umbrella', 'A jersey', 'A hat'], 0),
        gap('Umoya', 'Umoya []. (The wind is blowing.)', ['uyavunguza']),
    ]),
    quiz('Umndeni KaLindiwe: Lindiwe\'s Family', 'zulu', 3, ['family'], '2026-10-09', [
        text('Umndeni wami (My family)',
            'Igama lami nguLindiwe. Ngineminyaka eyisishiyagalolunye. Nginomfowethu omncane nodadewethu omdala. Umama ungudokotela, ubaba ungumshayeli webhasi. (My name is Lindiwe. I am nine years old. I have a younger brother and an older sister. My mother is a doctor, my father is a bus driver.)'),
        choice('Iminyaka', 'How old is Lindiwe?', ['Seven', 'Eight', 'Nine'], 2),
        choice('Umndeni', "What does 'udadewethu' mean?", ['My sister', 'My brother', 'My aunt'], 0),
        choice('Umsebenzi', "What is Lindiwe's father's job?", ['Doctor', 'Bus driver', 'Teacher'], 1),
        gap('Umfowethu', 'Nginomfowethu []. (I have a younger brother.)', ['omncane']),
    ]),

    // ---- Level 3, English: short stories ----
    quiz('The Lost Puppy', 'english', 3, ['animals', 'daily-life'], '2026-10-08', [
        text('A small cry',
            'On her way home from school, Ayanda heard a small cry behind a bush. It was a puppy with a blue collar. The collar had a phone number on it, so Ayanda and her mother called the owner. The owner was so happy that he thanked them again and again.'),
        choice('Finding the puppy', 'Where did Ayanda find the puppy?', ['Behind a bush', 'In the classroom', 'Under a car'], 0),
        choice('The owner', 'How did they find the owner?', ['They put up posters', 'They called the number on the collar', 'They asked the teacher'], 1),
        choice('The owner', 'How did the owner feel?', ['Angry', 'Sleepy', 'Very happy'], 2),
        gap('The collar', 'It was a puppy with a blue [].', ['collar']),
    ]),
    quiz('Planting a Vegetable Garden', 'english', 3, ['nature', 'food'], '2026-10-08', [
        text('Our garden',
            'Our class planted a vegetable garden. First we dug the soil, then we planted spinach and carrot seeds. We watered them every morning. After eight weeks, we picked the vegetables and made a big pot of soup.'),
        choice('Steps', 'What did the class do first?', ['Planted seeds', 'Dug the soil', 'Made soup'], 1),
        choice('Vegetables', 'Which vegetables did they plant?', ['Spinach and carrots', 'Potatoes and onions', 'Beans and peas'], 0),
        choice('Waiting', 'How long did they wait before picking the vegetables?', ['Two days', 'One year', 'Eight weeks'], 2),
        gap('Every morning', 'We [] them every morning.', ['watered']),
    ]),
    quiz('A Visit to the Library', 'english', 3, ['school', 'culture'], '2026-10-09', [
        text('Library day',
            'Every Friday, Grade 3 visits the library. The librarian, Mrs Pillay, helps each learner choose a book. Learners may borrow two books for one week. Sipho chose a book about the stars and planets.'),
        choice('Library day', 'When does Grade 3 visit the library?', ['Every Monday', 'Every Friday', 'Every day'], 1),
        choice('Borrowing', 'How many books may a learner borrow?', ['Two', 'One', 'Five'], 0),
        choice('Sipho', "What was Sipho's book about?", ['Animals', 'Cooking', 'Stars and planets'], 2),
        gap('Mrs Pillay', 'The [], Mrs Pillay, helps each learner choose a book.', ['librarian']),
    ]),
    quiz('Safe at the Beach', 'english', 3, ['travel', 'nature'], '2026-10-09', [
        text('Beach rules',
            'At the beach, always swim between the flags, where the lifeguards can see you. Never swim alone, and stay out of the water if the waves are big. Wear sunscreen and a hat, because the sun is strong.'),
        choice('Swimming', 'Where should you swim?', ['Far from the flags', 'Between the flags', 'Near the rocks'], 1),
        choice('The sun', 'Why should you wear sunscreen and a hat?', ['Because the sun is strong', 'Because it is cold', 'Because of the wind'], 0),
        choice('Big waves', 'What should you do if the waves are big?', ['Swim faster', 'Swim alone', 'Stay out of the water'], 2),
        gap('Lifeguards', 'Swim where the [] can see you.', ['lifeguards']),
    ]),
    quiz('Market Day', 'english', 3, ['shopping', 'food'], '2026-10-10', [
        text("Grandpa's stall",
            'On Saturday mornings, Grandpa sells fruit at the market. He arranges the oranges in neat piles. Apples cost three rand each, and a bag of oranges costs twenty rand. By lunchtime, most of the fruit is sold.'),
        choice('Market day', 'When does Grandpa sell fruit?', ['On Saturday mornings', 'Every evening', 'On Sundays'], 0),
        choice('Prices', 'How much does one apple cost?', ['Twenty rand', 'Three rand', 'Ten rand'], 1),
        choice('Prices', 'How much would two apples cost?', ['Three rand', 'Five rand', 'Six rand'], 2),
        gap('Lunchtime', 'By lunchtime, most of the fruit is [].', ['sold']),
    ]),
    quiz('How a Rainbow Forms', 'english', 3, ['weather', 'nature'], '2026-10-10', [
        text('The rainbow',
            'A rainbow appears when sunlight shines through raindrops. The light splits into colours: red, orange, yellow, green, blue, indigo and violet. You can usually see a rainbow when the sun comes out just after rain.'),
        choice('Light', 'What does sunlight shine through to make a rainbow?', ['Clouds', 'Raindrops', 'Trees'], 1),
        choice('Colours', 'How many colours are listed?', ['Five', 'Six', 'Seven'], 2),
        choice('Seeing a rainbow', 'When can you usually see a rainbow?', ['When the sun comes out just after rain', 'At midnight', 'When it snows'], 0),
        gap('Colours', 'The light splits into [].', ['colours', 'colors']),
    ]),

    // ---- Level 4, isiZulu: longer stories, past and future tense ----
    quiz('Uhambo Oluya Olwandle: A Trip to the Sea', 'zulu', 4, ['travel', 'nature'], '2026-10-10', [
        text('Olwandle (At the sea)',
            'Ngeholide sahamba ngemoto saya eThekwini. Sabona ulwandle okokuqala. Amagagasi ayemakhulu, ngakho asibhukudanga kude. Sakha izindlu zesihlabathi futhi sadla u-ayisikhilimu. (In the holidays we travelled by car to Durban. We saw the sea for the first time. The waves were big, so we did not swim far. We built sandcastles and ate ice cream.)'),
        choice('Uhambo', 'How did the family travel to Durban?', ['By train', 'By car', 'By bus'], 1),
        choice('Amagagasi', 'Why did they not swim far?', ['The waves were big', 'The water was cold', 'It was raining'], 0),
        choice('Ulimi', "'Asibhukudanga' means:", ['We swam', 'We did not swim', 'We will swim'], 1),
        gap('Ulwandle', 'Sabona [] okokuqala. (We saw the sea for the first time.)', ['ulwandle']),
    ]),
    quiz('Usuku Lokuzalwa LukaGogo: Grandmother\'s Birthday', 'zulu', 4, ['family', 'food'], '2026-10-10', [
        text('Kusasa (Tomorrow)',
            'Kusasa kuwusuku lokuzalwa lukaGogo. Umama uzopheka inyama nelayisi, mina ngizobhaka ikhekhe. Umalume uzoletha ujusi. Sizocula futhi sizosina! (Tomorrow is Grandmother\'s birthday. Mother will cook meat and rice, and I will bake a cake. Uncle will bring juice. We will sing and we will dance!)'),
        choice('Usuku lokuzalwa', 'Whose birthday is it tomorrow?', ["Grandmother's", "Mother's", "Uncle's"], 0),
        choice('Ikhekhe', 'Who will bake the cake?', ['Mother', 'The child telling the story', 'Uncle'], 1),
        choice('Ulimi', "'Ngizobhaka' talks about:", ['Something that happened yesterday', 'Something happening now', 'Something that will happen'], 2),
        gap('Sizosina', 'Sizocula futhi []! (We will sing and we will dance!)', ['sizosina']),
    ]),
    quiz('Ukubuza Indlela: Asking the Way', 'zulu', 4, ['directions', 'travel'], '2026-10-11', [
        text('Umtapo wolwazi (The library)',
            'Uxolo, umtapo wolwazi ukuphi? Qhubeka ngqo, bese ujikela kwesokudla ebhange. Umtapo wolwazi useduze nesibhedlela. Akukude, yimizuzu emihlanu nje. (Excuse me, where is the library? Go straight, then turn right at the bank. The library is next to the hospital. It is not far, just five minutes.)'),
        choice('Amagama', "What does 'umtapo wolwazi' mean?", ['The library', 'The hospital', 'The bank'], 0),
        choice('Indlela', 'Where do you turn right?', ['At the hospital', 'At the bank', 'At the school'], 1),
        choice('Amagama', "'Kwesokudla' means:", ['Left', 'Straight', 'Right'], 2),
        gap('Uxolo', '[], umtapo wolwazi ukuphi? (Excuse me, where is the library?)', ['Uxolo']),
    ]),
    quiz('Izilwane Zasendle: Wild Animals', 'zulu', 4, ['animals', 'nature'], '2026-10-11', [
        text('Izilwane zasendle (Wild animals)',
            'Indlovu yisilwane esikhulu kakhulu. Indlulamithi inentamo ende kakhulu, ngakho idla amaqabunga aphezulu ezihlahleni. Ingonyama ilala emini, bese izingela ebusuku. (The elephant is a very big animal. The giraffe has a very long neck, so it eats the leaves high up in the trees. The lion sleeps during the day, then hunts at night.)'),
        choice('Indlulamithi', 'Why does the giraffe eat leaves high in the trees?', ['It has a long neck', 'It is afraid of lions', 'It cannot walk'], 0),
        choice('Ingonyama', 'When does the lion hunt?', ['In the morning', 'At night', 'At midday'], 1),
        choice('Amagama', "What is 'indlulamithi'?", ['Elephant', 'Lion', 'Giraffe'], 2),
        gap('Indlovu', '[] yisilwane esikhulu kakhulu. (The elephant is a very big animal.)', ['Indlovu']),
    ]),
    quiz('Ukunakekela Umhlaba: Caring for the Earth', 'zulu', 4, ['nature', 'school'], '2026-10-11', [
        text('Esikoleni sethu (At our school)',
            'Esikoleni sethu asilahli udoti phansi. Sifaka udoti emgqonyeni kadoti. Sitshala izihlahla futhi siyonga amanzi ngokuvala umpompi. (At our school we do not throw litter on the ground. We put litter in the rubbish bin. We plant trees and we save water by closing the tap.)'),
        choice('Udoti', 'Where do the learners put their litter?', ['On the ground', 'In the rubbish bin', 'In the river'], 1),
        choice('Amanzi', 'How do they save water?', ['By closing the tap', 'By planting trees', 'By swimming'], 0),
        choice('Amagama', "What does 'sitshala izihlahla' mean?", ['We cut trees', 'We climb trees', 'We plant trees'], 2),
        gap('Udoti', 'Asilahli [] phansi. (We do not throw litter on the ground.)', ['udoti']),
    ]),
    quiz('Umdlalo Webhola: The Soccer Match', 'zulu', 4, ['culture', 'numbers'], '2026-10-11', [
        text('NgoMgqibelo (On Saturday)',
            'NgoMgqibelo iqembu lethu ladlala nesikole esiseduze. Ekuqaleni sasihlulwa ngegoli elilodwa, kodwa uNomsa washaya amagoli amabili. Sawina ngamagoli amabili kwelilodwa! (On Saturday our team played against a nearby school. At first we were losing by one goal, but Nomsa scored two goals. We won two goals to one!)'),
        choice('Usuku', 'When did the team play?', ['On Friday', 'On Saturday', 'On Sunday'], 1),
        choice('Amagoli', 'Who scored two goals?', ['The other school', 'Nomsa', 'The teacher'], 1),
        choice('Amagoli', 'What was the final score?', ['Two to one', 'One to one', 'Two to two'], 0),
        gap('Sawina', '[] ngamagoli amabili kwelilodwa. (We won two goals to one.)', ['Sawina']),
    ]),

    // ---- Level 4, English: longer texts and inference ----
    quiz('The Science Fair', 'english', 4, ['school'], '2026-10-10', [
        text('The ice cube test',
            'Kagiso wanted to know which material keeps ice frozen the longest. He wrapped one ice cube in newspaper, one in foil and one in a woolly sock, and he left a fourth cube unwrapped. After an hour, the cube in the sock was the biggest, while the unwrapped cube had completely melted. His experiment won second prize at the school science fair.'),
        choice('The question', 'What was Kagiso trying to find out?', ['Which material keeps ice frozen the longest', 'How fast water boils', 'Which sock is the warmest to wear'], 0),
        choice('A fair test', 'Why did he leave one cube unwrapped?', ['He ran out of materials', 'To compare the others against it', 'Because it was too small'], 1),
        choice('The result', 'Which material kept the ice frozen best?', ['Newspaper', 'Foil', 'The woolly sock'], 2),
        gap('The result', 'The unwrapped cube had completely [].', ['melted']),
    ]),
    quiz('Saving Water at Home', 'english', 4, ['nature', 'daily-life'], '2026-10-10', [
        text('Every drop counts',
            'South Africa is a dry country, so every drop of water counts. Instead of running the tap while you brush your teeth, use a cup. A short shower uses far less water than a full bath, and water from washing vegetables can be used for the garden.'),
        choice('Why save water', 'Why does every drop of water count in South Africa?', ['It is a dry country', 'Water is expensive in shops', 'It rains every day'], 0),
        choice('Showers', 'What uses less water?', ['A full bath', 'A short shower', 'Leaving the tap on'], 1),
        choice('Reusing water', 'What can water from washing vegetables be used for?', ['Drinking', 'Washing the car', 'Watering the garden'], 2),
        gap('Brushing teeth', 'Instead of running the tap while you brush your teeth, use a [].', ['cup']),
    ]),
    quiz('Table Mountain', 'english', 4, ['travel', 'nature'], '2026-10-11', [
        text('A flat-topped mountain',
            'Table Mountain in Cape Town is famous for its flat top. Visitors can hike to the top or ride the cable car, which takes about five minutes. On some days a white cloud, nicknamed the "tablecloth", covers the top of the mountain, and the cable car may close because of strong winds.'),
        choice('Famous for', 'What is Table Mountain famous for?', ['Its flat top', 'Its snow', 'Its waterfalls'], 0),
        choice('The tablecloth', 'What is the "tablecloth"?', ['A picnic blanket', 'A white cloud over the top', 'A flag'], 1),
        choice('The cable car', 'Why might the cable car close?', ['It is too busy', 'It is night', 'Strong winds'], 2),
        gap('The cable car', 'The cable car ride takes about five [].', ['minutes']),
    ]),
    quiz('Honey Bees', 'english', 4, ['animals', 'nature'], '2026-10-11', [
        text('Life in a hive',
            'Honey bees live together in a hive. The queen lays the eggs, while the worker bees collect nectar from flowers and turn it into honey. As they fly from flower to flower, they carry pollen, which helps plants make fruit and seeds. Without bees, many of the foods we eat would be hard to grow.'),
        choice('The hive', 'Who lays the eggs in a hive?', ['The worker bees', 'The queen', 'The flowers'], 1),
        choice('Worker bees', 'What do worker bees turn nectar into?', ['Honey', 'Wax', 'Pollen'], 0),
        choice('Why bees matter', 'Why are bees important for our food?', ['They eat pests', 'They water plants', 'They carry pollen that helps plants make fruit and seeds'], 2),
        gap('The hive', 'Honey bees live together in a [].', ['hive']),
    ]),
    quiz("Thandi's Big Decision", 'english', 4, ['conversation', 'school'], '2026-10-12', [
        text('On the playground',
            'Thandi found a wallet on the playground. It had fifty rand inside, enough to buy the book she had wanted for months. She thought about it carefully, but in the end she handed the wallet to her teacher. The next day, the owner thanked her in front of the whole class.'),
        choice('The wallet', 'What did Thandi find?', ['A wallet', 'A book', 'A phone'], 0),
        choice('A hard choice', 'Why was the decision hard for Thandi?', ['The wallet was heavy', 'The money could buy a book she wanted', 'She did not like her teacher'], 1),
        choice('Thandi', 'Which word best describes Thandi?', ['Careless', 'Lazy', 'Honest'], 2),
        gap('The right thing', 'In the end she [] the wallet to her teacher.', ['handed', 'gave']),
    ]),
    quiz('The Phases of the Moon', 'english', 4, ['nature', 'school'], '2026-10-12', [
        text('Moonlight',
            'The moon does not make its own light; it reflects light from the sun. As the moon travels around the Earth, we see different amounts of its lit side. When we cannot see it at all, it is a new moon, and when we see the whole circle, it is a full moon. One full cycle takes about a month.'),
        choice('Moonlight', "Where does the moon's light come from?", ['The moon makes it', 'It reflects light from the sun', 'From the stars'], 1),
        choice('Phases', 'What do we call the moon when we see the whole circle?', ['A new moon', 'A half moon', 'A full moon'], 2),
        choice('The cycle', 'About how long does one full cycle take?', ['A month', 'A day', 'A year'], 0),
        gap('New moon', 'When we cannot see the moon at all, it is a [] moon.', ['new']),
    ]),

    // ---- Level 5, isiZulu: proverbs (izaga) and a folktale ----
    quiz('Izaga: Umuntu Ngumuntu Ngabantu', 'zulu', 5, ['culture', 'conversation'], '2026-10-12', [
        text('Ubuntu',
            'Isaga esithi "Umuntu ngumuntu ngabantu" sisho ukuthi umuntu uba ngumuntu ngenxa yabanye abantu. Lesi saga sisifundisa ubuntu: ukusizana, ukuhloniphana nokwabelana. (The proverb "A person is a person through other people" means that we become who we are because of other people. This proverb teaches us ubuntu: helping one another, respecting one another and sharing.)'),
        choice('Ubuntu', "What value does 'Umuntu ngumuntu ngabantu' teach?", ['Ubuntu: we need one another', 'Being the fastest', 'Keeping everything for yourself'], 0),
        choice('Amagama', "What does 'ukusizana' mean?", ['Fighting one another', 'Helping one another', 'Running away'], 1),
        choice('Amagama', "What is 'isaga'?", ['A riddle', 'A song', 'A proverb'], 2),
        choice('Ubuntu', 'Your friend drops her books. Which action shows ubuntu?', ['Helping her pick them up', 'Laughing at her', 'Walking past'], 0),
        gap('Isaga', 'Umuntu ngumuntu []. (A person is a person through other people.)', ['ngabantu']),
    ]),
    quiz('Izaga: Izandla Ziyagezana', 'zulu', 5, ['culture', 'vocabulary'], '2026-10-12', [
        text('Izandla ziyagezana (Hands wash each other)',
            'Isaga esithi "Izandla ziyagezana" sisho ukuthi isandla esisodwa sigeza esinye. Incazelo yaso ijulile: uma sisizana, sonke siyazuza. (The proverb "Hands wash each other" says that one hand washes the other. Its deeper meaning: when we help each other, we all benefit.)'),
        choice('Isaga', "What is the literal meaning of 'Izandla ziyagezana'?", ['Hands wash each other', 'Hands are always clean', 'Wash your hands before eating'], 0),
        choice('Incazelo', 'What is the deeper meaning of the proverb?', ['Always wash your hands', 'When we help each other, we all benefit', 'Work alone to finish faster'], 1),
        choice('Amagama', "What does 'incazelo' mean?", ['Story', 'Question', 'Meaning'], 2),
        choice('Isaga', 'Which situation matches this proverb best?', ['A boy eats all the sweets himself', 'Two neighbours take turns to help each other build their houses', 'A girl sleeps late'], 1),
        gap('Isaga', 'Izandla []. (Hands wash each other.)', ['ziyagezana']),
    ]),
    quiz('Unogwaja Nofudu: The Hare and the Tortoise', 'zulu', 5, ['folklore', 'animals'], '2026-10-12', [
        text('Inganekwane (A folktale)',
            'Kwasukasukela, uNogwaja wahleka uFudu ngoba luhamba kancane. UFudu lwathi: "Masigijime!" UNogwaja wagijima ngejubane, kodwa wazumeka ngaphansi kwesihlahla. UFudu aluzange lume, lwaqhubeka kancane kancane, lwaze lwanqoba. Cosu cosu iyaphela. (Once upon a time, Hare laughed at Tortoise because it walked slowly. Tortoise said: "Let us race!" Hare ran fast, but he fell asleep under a tree. Tortoise never stopped; it kept going slowly, slowly, until it won. And so the story ends.)'),
        choice('UNogwaja', 'Why did Hare laugh at Tortoise?', ['Tortoise was small', 'Tortoise walked slowly', 'Tortoise could not swim'], 1),
        choice('Umjaho', 'What did Hare do during the race?', ['He fell asleep under a tree', 'He helped Tortoise', 'He went home'], 0),
        choice('Isifundo', 'What lesson does the story teach?', ['Fast animals always win', 'Never race your friends', 'Keep going steadily and do not give up'], 2),
        choice('Inganekwane', 'How does an isiZulu folktale often begin?', ['Cosu cosu iyaphela', 'Kwasukasukela', 'Sala kahle'], 1),
        gap('UFudu', 'UFudu lwaqhubeka kancane kancane, lwaze []. (Tortoise kept going slowly, slowly, until it won.)', ['lwanqoba']),
    ]),
    quiz('Usuku Lwamagugu: Heritage Day', 'zulu', 5, ['culture', 'food'], '2026-10-13', [
        text('Usuku Lwamagugu (Heritage Day)',
            'Ngomhla zingama-24 kuSeptemba siyagubha uSuku Lwamagugu eNingizimu Afrika. Abantu bagqoka izingubo zendabuko, bacule izingoma zakudala futhi baphekelane ukudla kwendabuko. Lolu suku lusikhumbuza ukuthi amasiko ethu ahlukahlukene ayingcebo. (On 24 September we celebrate Heritage Day in South Africa. People wear traditional clothes, sing old songs and cook traditional food for one another. This day reminds us that our many different cultures are a treasure.)'),
        choice('Usuku', 'When is Heritage Day?', ['16 June', '24 September', '1 January'], 1),
        choice('Amagama', "What does 'izingubo zendabuko' mean?", ['Traditional clothes', 'School uniforms', 'New shoes'], 0),
        choice('Incazelo', 'What does Heritage Day remind us?', ['That holidays are long', 'That everyone should be the same', 'That our different cultures are a treasure'], 2),
        choice('Amagama', "'Siyagubha' means:", ['We celebrate', 'We sleep', 'We forget'], 0),
        gap('Usuku Lwamagugu', 'Ngomhla zingama-24 kuSeptemba siyagubha uSuku []. (On 24 September we celebrate Heritage Day.)', ['Lwamagugu']),
    ]),
    quiz('Izaga: Indlela Ibuzwa Kwabaphambili', 'zulu', 5, ['culture', 'travel'], '2026-10-13', [
        text('Indlela (The way)',
            'Isaga esithi "Indlela ibuzwa kwabaphambili" sisho ukuthi uma ungazi indlela, buza labo asebeyihambile. Ngamanye amazwi, funda kulabo abanolwazi, njengogogo nomkhulu, othisha nabazali. (The proverb "The way is asked of those who have gone before" means that if you do not know the way, ask those who have already walked it. In other words, learn from people with experience, like grandparents, teachers and parents.)'),
        choice('Isaga', 'What does this proverb advise?', ['Learn from people who have experience', 'Always walk alone', 'Never ask questions'], 0),
        choice('Amagama', "What does 'ngamanye amazwi' mean?", ['Long ago', 'In other words', 'Every day'], 1),
        choice('Isaga', 'You are starting at a new school. Following this proverb, who could you ask for advice?', ['Nobody', 'A new learner who just arrived', 'A learner who has been at the school for years'], 2),
        choice('Amagama', "What does 'abanolwazi' mean?", ['People with knowledge', 'People who are lost', 'People who are young'], 0),
        gap('Isaga', 'Indlela ibuzwa []. (The way is asked of those who have gone before.)', ['kwabaphambili']),
    ]),
    quiz('Izaga: Inkunzi Isematholeni', 'zulu', 5, ['culture', 'family'], '2026-10-13', [
        text('Inkunzi isematholeni (The bull is among the calves)',
            'Isaga esithi "Inkunzi isematholeni" sisho ukuthi inkunzi enamandla ivela phakathi kwamathole. Abantu abadala basisebenzisa ukukhuthaza izingane: abaholi bakusasa bakhona phakathi kwabo namuhla. (The proverb "The bull is among the calves" says that a strong bull comes from among the calves. Older people use it to encourage children: the leaders of tomorrow are among them today.)'),
        choice('Amagama', "What are 'amathole'?", ['Calves', 'Bulls', 'Birds'], 0),
        choice('Isaga', 'Why do older people use this proverb?', ['To talk about farming only', 'To encourage children', 'To make children sad'], 1),
        choice('Amagama', "What does 'abaholi bakusasa' mean?", ['The leaders of yesterday', 'The teachers of today', 'The leaders of tomorrow'], 2),
        choice('Isaga', 'Which sentence fits the proverb?', ['A young learner today can become a great leader one day', 'Only old people can lead', 'Calves never grow up'], 0),
        gap('Isaga', 'Inkunzi []. (The bull is among the calves.)', ['isematholeni']),
    ]),

    // ---- Level 5, English: idioms, fables and nuance ----
    quiz('Idioms About the Weather', 'english', 5, ['vocabulary', 'weather'], '2026-10-12', [
        text('What is an idiom?',
            'An idiom is a group of words with a meaning different from the meaning of each word. If it is "raining cats and dogs", it is raining very heavily. If something is "a piece of cake", it is very easy. If you are "under the weather", you feel a little ill.'),
        choice('Idioms', "What does 'raining cats and dogs' mean?", ['Animals are falling from the sky', 'It is raining very heavily', 'It is a sunny day'], 1),
        choice('Idioms', 'The test was "a piece of cake". How was the test?', ['Very easy', 'Very hard', 'Delicious'], 0),
        choice('Idioms', 'Lerato is "under the weather" today. How does she feel?', ['Very happy', 'Excited', 'A little ill'], 2),
        choice('Idioms', 'What is an idiom?', ['A kind of weather', 'A group of words whose meaning differs from the meaning of each word', 'A long story'], 1),
        gap('Idioms', 'If you feel a little ill, you are under the [].', ['weather']),
    ]),
    quiz('Idioms About People', 'english', 5, ['conversation', 'vocabulary'], '2026-10-12', [
        text('Kind words',
            'Some idioms describe how we treat people. To "lend a hand" means to help. To "break the ice" means to start a friendly conversation with someone new. If you are "over the moon", you are extremely happy.'),
        choice('Lend a hand', 'Sizwe offered to lend a hand. What did he offer?', ['To help', 'To borrow a hand', 'To wave goodbye'], 0),
        choice('Break the ice', 'On the first day of school, Amy told a joke to break the ice. Why?', ['To make the room colder', 'To start a friendly conversation', 'To end the lesson'], 1),
        choice('Over the moon', 'Naledi was over the moon when she won the race. How did she feel?', ['Tired', 'Worried', 'Extremely happy'], 2),
        choice('Idioms', 'Which idiom means "to help"?', ['Over the moon', 'Lend a hand', 'Break the ice'], 1),
        gap('Break the ice', 'To start a friendly conversation with someone new is to break the [].', ['ice']),
    ]),
    quiz('The Fox and the Grapes', 'english', 5, ['folklore', 'animals'], '2026-10-13', [
        text('A fable',
            'A hungry fox saw a bunch of ripe grapes hanging high on a vine. He jumped again and again, but he could not reach them. At last he walked away, saying, "Those grapes are probably sour anyway." This fable shows how some people pretend they never wanted what they cannot have.'),
        choice('The fox', 'Why did the fox want the grapes?', ['He was hungry', 'He wanted to sell them', 'He liked the colour'], 0),
        choice('The grapes', 'Why could the fox not get the grapes?', ['They were sour', 'They were too high', 'Someone took them'], 1),
        choice('The lesson', 'Why did the fox say the grapes were sour?', ['He had tasted them', 'A bird told him', 'He pretended he did not want them'], 2),
        choice('Fables', 'What is a fable?', ['A short story that teaches a lesson', 'A news report', 'A recipe'], 0),
        gap('The fox', 'The fox jumped again and again, but he could not [] them.', ['reach']),
    ]),
    quiz('Nelson Mandela', 'english', 5, ['culture', 'school'], '2026-10-13', [
        text('A life of service',
            'Nelson Mandela spent 27 years in prison because he fought against apartheid, a system of unfair laws that separated people by race. After his release in 1990, he worked for peace and forgiveness. In 1994 he became South Africa\'s first democratically elected president. Every year on 18 July, people around the world celebrate Mandela Day by spending 67 minutes helping others.'),
        choice('Prison', 'How long was Nelson Mandela in prison?', ['10 years', '27 years', '67 years'], 1),
        choice('Apartheid', 'What was apartheid?', ['A system of unfair laws that separated people by race', 'A sports competition', 'A holiday'], 0),
        choice('1994', 'What happened in 1994?', ['Mandela went to prison', 'Mandela Day began', 'Mandela became the first democratically elected president'], 2),
        choice('Mandela Day', 'How do people celebrate Mandela Day?', ['By having a long holiday', 'By spending 67 minutes helping others', 'By staying at home'], 1),
        gap('Mandela Day', 'Mandela Day is celebrated every year on 18 [].', ['July']),
    ]),
    quiz('Synonyms and Antonyms', 'english', 5, ['vocabulary', 'school'], '2026-10-13', [
        text('Word pairs',
            'Synonyms are words with similar meanings, such as "big" and "enormous". Antonyms are words with opposite meanings, such as "ancient" and "modern". Using a variety of words makes your writing more interesting.'),
        choice('Synonyms', "Which word is a synonym of 'enormous'?", ['Tiny', 'Huge', 'Quiet'], 1),
        choice('Antonyms', "Which word is an antonym of 'ancient'?", ['Modern', 'Old', 'Broken'], 0),
        choice('Synonyms', 'Which pair are synonyms?', ['hot and cold', 'fast and slow', 'happy and cheerful'], 2),
        choice('Antonyms', 'Which pair are antonyms?', ['brave and fearless', 'generous and selfish', 'begin and start'], 1),
        gap('Antonyms', 'Words with opposite meanings are called [].', ['antonyms']),
    ]),
    quiz('The Journey of a Raindrop', 'english', 5, ['nature', 'weather'], '2026-10-14', [
        text('The water cycle',
            'The sun heats water in oceans and rivers, and it rises into the air as water vapour; this is called evaporation. High in the sky, the vapour cools and forms clouds, which is called condensation. When the droplets become heavy, they fall as rain, hail or snow, which is called precipitation. The water flows back into rivers and oceans, and the cycle begins again.'),
        choice('Evaporation', 'What is evaporation?', ['Water falling as rain', 'Water rising into the air as vapour', 'Clouds disappearing'], 1),
        choice('Clouds', 'What forms when water vapour cools?', ['Clouds', 'Rivers', 'Sunlight'], 0),
        choice('Precipitation', 'Which word means rain, hail or snow falling?', ['Condensation', 'Evaporation', 'Precipitation'], 2),
        choice('The cycle', 'Why is it called a cycle?', ['It happens only once', 'It begins again and repeats', 'It only happens in winter'], 1),
        gap('Condensation', 'When water vapour cools and forms clouds, it is called [].', ['condensation']),
    ]),

    // ---- Level 6: questions for the level 5 to 6 challenge, in both languages ----
    quiz('Amanzi Ayimpilo: Water Is Life', 'zulu', 6, ['nature', 'weather'], '2026-10-14', [
        text('Amanzi (Water)',
            'ENingizimu Afrika imvula ayini ngokwanele kuzo zonke izindawo. Ngesikhathi sesomiso, amadamu ayoma, abalimi bahlupheka nezilwane zihlupheka ngenxa yokoma. Yingakho kubalulekile ukonga amanzi: vala umpompi uma uxubha amazinyo, uqoqe amanzi emvula ukuze unisele izitshalo. (In South Africa it does not rain enough in every area. During a drought, dams dry up, and farmers and animals suffer from thirst. That is why it is important to save water: close the tap when you brush your teeth, and collect rainwater to water the plants.)'),
        choice('Amagama', "What is 'isomiso'?", ['A flood', 'A drought', 'A storm'], 1),
        choice('Isomiso', 'What happens to the dams during a drought?', ['They dry up', 'They overflow', 'They freeze'], 0),
        choice('Ukonga amanzi', 'Which tip for saving water is given?', ['Leave the tap running', 'Wash the car every day', 'Close the tap when you brush your teeth'], 2),
        choice('Amagama', "'Yingakho' means:", ['That is why', 'Because of rain', 'After that'], 0),
        gap('Izitshalo', 'Qoqa amanzi emvula ukuze [] izitshalo. (Collect rainwater so that you can water the plants.)', ['unisele']),
    ]),
    quiz('Incwadi Eya KuGogo: A Letter to Grandmother', 'zulu', 6, ['family', 'school'], '2026-10-14', [
        text('Incwadi (A letter)',
            'Gogo othandekayo, ngethemba ukuthi uyaphila. Lapha ekhaya sonke siyaphila. Ngonyaka odlule bengingakwazi ukufunda kahle, kodwa manje sengifunda izincwadi ezinde ngedwa. Uthisha wathi uma ngiqhubeka ngizimisele, ngingaba ngumbhali ngelinye ilanga. Ngiyakukhumbula kakhulu. Owakho, Zanele. (Dear Grandmother, I hope you are well. Here at home we are all well. Last year I could not read well, but now I read long books by myself. The teacher said that if I keep working hard, I could become a writer one day. I miss you very much. Yours, Zanele.)'),
        choice('Incwadi', 'Who is the letter to?', ['A teacher', 'Grandmother', 'A friend'], 1),
        choice('Ngonyaka odlule', 'What could Zanele not do well last year?', ['Read', 'Sing', 'Swim'], 0),
        choice('Uthisha', 'What did the teacher say Zanele could become?', ['A doctor', 'A teacher', 'A writer'], 2),
        choice('Amagama', "'Ngiyakukhumbula' means:", ['I see you', 'I miss you', 'I help you'], 1),
        gap('Ngedwa', 'Manje sengifunda izincwadi ezinde []. (Now I read long books by myself.)', ['ngedwa']),
    ]),
    quiz('Persuasive Writing', 'english', 6, ['school', 'vocabulary'], '2026-10-14', [
        text('Convincing a reader',
            'Persuasive writing tries to convince the reader to agree with an opinion. A good persuasive text states a clear opinion, gives reasons supported by facts, and ends with a strong conclusion. Writers often use phrases such as "Clearly," and "Surely you agree", and they may answer the arguments the other side might make.'),
        choice('Purpose', 'What is the purpose of persuasive writing?', ['To convince the reader to agree with an opinion', 'To tell a funny story', 'To list instructions'], 0),
        choice('Reasons', 'What should support the reasons in a persuasive text?', ['Jokes', 'Facts', 'Pictures'], 1),
        choice('Examples', 'Which sentence is the most persuasive?', ['I like dogs.', 'Some people have pets.', 'Clearly, every school needs a library, because reading improves learning.'], 2),
        choice('The other side', "Why might a writer answer the other side's arguments?", ['To make the text longer', 'To show those arguments are weaker and make their own case stronger', 'To change the topic'], 1),
        gap('Ending', 'A good persuasive text ends with a strong [].', ['conclusion']),
    ]),
    quiz('The Great Migration', 'english', 6, ['animals', 'travel'], '2026-10-14', [
        text('Following the rain',
            'Every year, more than a million wildebeest, together with zebras and gazelles, travel in a huge circle through the Serengeti in Tanzania and the Maasai Mara in Kenya. They follow the rains in search of fresh grass and water. The journey is dangerous: crocodiles wait in the Mara River, and lions follow the herds. Even so, the migration keeps the grasslands healthy, because grazing and trampling help new grass grow.'),
        choice('Why migrate', 'Why do the animals migrate?', ['To follow the rains in search of fresh grass and water', 'To escape the snow', 'To find caves to sleep in'], 0),
        choice('Where', 'Which two countries does the migration pass through?', ['South Africa and Namibia', 'Tanzania and Kenya', 'Egypt and Sudan'], 1),
        choice('Dangers', 'What danger waits in the Mara River?', ['Hippos', 'Sharks', 'Crocodiles'], 2),
        choice('The grasslands', 'How does the migration help the grasslands?', ['The animals plant seeds by hand', 'Grazing and trampling help new grass grow', 'It brings the rain'], 1),
        gap('Wildebeest', 'More than a million [] travel in a huge circle.', ['wildebeest', 'wildebeests']),
    ]),
];

// Approved tests learners take from Explore. Level 1 is where the demo learners
// are; each level's level-up challenge draws its questions from the level above.
export const SEED_TESTS: ContentSeedItem[] = [
    // ---- Level 1, isiZulu ----
    approvedTest('Ukubingelela: Greetings Quiz', 'zulu', 1, true, ['greetings', 'listening'], '2026-09-26', [
        text('Ukubingelela (Greetings)',
            'Sawubona means hello to one person. Sanibonani means hello to a group. Unjani? asks How are you?'),
        choice('Ukubingelela', 'How do you greet one person in isiZulu?', ['Sanibonani', 'Sawubona', 'Hamba kahle'], 1),
        choice('Ukubonga', "What does 'Ngiyabonga' mean?", ['Thank you', 'Goodbye', 'Please'], 0),
        gap('Ukuphendula', "Someone asks 'Unjani?' You answer: [], ngiyabonga. (I am well, thank you.)", ['Ngiyaphila']),
        listen('Lalela: what is the speaker saying?', ['Goodbye, stay well.', 'Thank you very much.', 'Hello, how are you?'], 2),
    ]),
    approvedTest('Izinombolo: Numbers 1 to 5', 'zulu', 1, true, ['numbers'], '2026-09-26', [
        text('Ukubala (Counting)', 'kunye (1), kubili (2), kuthathu (3), kune (4), kuhlanu (5)'),
        choice('Izinombolo', "Which word means 'three'?", ['kubili', 'kuhlanu', 'kuthathu'], 2),
        choice('Izinombolo', "What number is 'kune'?", ['Two', 'Four', 'Five'], 1),
        gap('Ukubala', 'Kunye, kubili, [], kune, kuhlanu.', ['kuthathu']),
    ]),
    approvedTest('Umndeni Wami: My Family', 'zulu', 1, true, ['family'], '2026-09-27', [
        text('Umndeni (Family)', 'umama (mother), ubaba (father), ugogo (grandmother), umkhulu (grandfather), ingane (child)'),
        choice('Umndeni', "What does 'ugogo' mean?", ['Mother', 'Grandmother', 'Sister'], 1),
        choice('Umndeni', "Which word means 'father'?", ['ubaba', 'umama', 'umkhulu'], 0),
        gap('Umndeni', '[] wami uyapheka. (My mother is cooking.)', ['Umama']),
    ]),
    approvedTest('Izilwane: Animals Quiz', 'zulu', 1, true, ['animals'], '2026-09-27', [
        text('Izilwane (Animals)', 'inja (dog), ikati (cat), inkomo (cow), inkukhu (chicken), ingonyama (lion)'),
        choice('Izilwane', "What is 'inja' in English?", ['Cat', 'Cow', 'Dog'], 2),
        choice('Izilwane', "Which animal is 'ingonyama'?", ['Lion', 'Elephant', 'Chicken'], 0),
        gap('Izilwane', '[] iyakhonkotha. (The dog barks.)', ['Inja']),
        choice('Izilwane', "Which word means 'cow'?", ['inkukhu', 'inkomo', 'ikati'], 1),
    ]),
    approvedTest('Ukudla Neziphuzo: Food and Drink', 'zulu', 1, true, ['food'], '2026-09-28', [
        text('Ukudla (Food)', 'amanzi (water), ubisi (milk), isinkwa (bread), iphalishi (porridge), inyama (meat)'),
        choice('Iziphuzo', "What is 'amanzi'?", ['Milk', 'Water', 'Tea'], 1),
        gap('Ukucela', 'Ngicela []. (Water, please.)', ['amanzi']),
        choice('Ukudla', "Which word means 'bread'?", ['isinkwa', 'ubisi', 'inyama'], 0),
    ]),
    approvedTest('Imibala: Colours', 'zulu', 1, true, ['vocabulary'], '2026-09-28', [
        text('Imibala (Colours)',
            'bomvu (red), mnyama (black), mhlophe (white), luhlaza (green or blue). Ubisi lumhlophe. (Milk is white.)'),
        choice('Imibala', "What colour is 'mnyama'?", ['White', 'Red', 'Black'], 2),
        choice('Imibala', 'Ubisi lumhlophe. What colour is the milk?', ['White', 'Green', 'Red'], 0),
        gap('Imibala', 'Utshani bu[]. (The grass is green.)', ['luhlaza']),
    ]),
    approvedTest('Ukuzethula: Introducing Yourself', 'zulu', 1, false, ['greetings', 'conversation'], '2026-09-29', [
        text('Ukuzethula (Introducing yourself)',
            'Igama lami nguThabo. (My name is Thabo.) Ngivela eThekwini. (I come from Durban.) Ngihlala eGoli. (I live in Johannesburg.)'),
        choice('Imibuzo', "How do you ask 'What is your name?'", ['Uhlala kuphi?', 'Ngubani igama lakho?', 'Unjani?'], 1),
        choice('Imibuzo', "What does 'Uhlala kuphi?' mean?", ['Where do you live?', 'How old are you?', 'Where are you going?'], 0),
        gap('Igama', 'Igama [] nguThabo. (My name is Thabo.)', ['lami']),
    ]),

    // ---- Level 1, English ----
    approvedTest('Everyday English: Greetings', 'english', 1, true, ['greetings'], '2026-09-29', [
        text('Polite words', 'Hello. Good morning. Please. Thank you. Goodbye.'),
        choice('Greetings', 'What do you say when you meet someone in the morning?', ['Good night', 'Good morning', 'Goodbye'], 1),
        gap('Saying thank you', 'Your friend helps you. You say: "Thank [] very much!"', ['you']),
        choice('Asking nicely', 'Which word do you use to ask for something politely?', ['Please', 'Sorry', 'Hello'], 0),
    ]),
    approvedTest('Days of the Week', 'english', 1, false, ['daily-life'], '2026-09-30', [
        text('The week', 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.'),
        choice('The week', 'Which day comes after Monday?', ['Sunday', 'Thursday', 'Tuesday'], 2),
        gap('The weekend', 'Saturday and [] are the weekend.', ['Sunday']),
        choice('The week', 'How many days are in a week?', ['Seven', 'Five', 'Ten'], 0),
    ]),

    // ---- Level 2, isiZulu (the level-up challenge's question pool) ----
    approvedTest('Izinsuku Zesonto: Days of the Week', 'zulu', 2, true, ['daily-life'], '2026-10-01', [
        text('Izinsuku (Days)',
            'uMsombuluko (Monday), uLwesibili (Tuesday), uLwesithathu (Wednesday), uLwesine (Thursday), uLwesihlanu (Friday), uMgqibelo (Saturday), iSonto (Sunday)'),
        choice('Izinsuku', "Which day is 'uLwesihlanu'?", ['Tuesday', 'Friday', 'Sunday'], 1),
        choice('Izinsuku', "How do you say 'Monday' in isiZulu?", ['uMgqibelo', 'uLwesine', 'uMsombuluko'], 2),
        gap('Namuhla', 'Namuhla ngu[]. (Today is Saturday.)', ['Mgqibelo']),
        choice('Izinsuku', 'Which day comes after uLwesithathu (Wednesday)?', ['uLwesine', 'uLwesibili', 'iSonto'], 0),
    ]),
    approvedTest('Isimo Sezulu: The Weather', 'zulu', 2, true, ['weather'], '2026-10-01', [
        text('Isimo sezulu (Weather)',
            'Liyana. (It is raining.) Kuyashisa. (It is hot.) Kuyabanda. (It is cold.) Ilanga liyaphuma. (The sun is coming out.)'),
        choice('Isimo sezulu', "What does 'Kuyabanda' mean?", ['It is hot', 'It is cold', 'It is raining'], 1),
        choice('Isimo sezulu', 'Which sentence says that it is raining?', ['Kuyashisa.', 'Ilanga liyaphuma.', 'Liyana.'], 2),
        gap('Ehlobo', 'Ehlobo [] kakhulu. (In summer it is very hot.)', ['kuyashisa']),
    ]),
    approvedTest('Umzimba: Parts of the Body', 'zulu', 2, true, ['vocabulary'], '2026-10-02', [
        text('Umzimba (The body)', 'ikhanda (head), iso (eye), indlebe (ear), umlomo (mouth), isandla (hand), unyawo (foot)'),
        choice('Umzimba', "What is 'isandla'?", ['Hand', 'Foot', 'Head'], 0),
        choice('Umzimba', "Which word means 'ear'?", ['iso', 'indlebe', 'umlomo'], 1),
        choice('Ukubhala', "'Ngibhala ngesandla sami.' What do I write with?", ['My foot', 'My ear', 'My hand'], 2),
        gap('Ikhanda', '[] lami libuhlungu. (My head is sore.)', ['Ikhanda']),
    ]),
    approvedTest('Esikoleni: At School', 'zulu', 2, true, ['school'], '2026-10-02', [
        text('Esikoleni (At school)',
            'Ngiya esikoleni. (I am going to school.) Uthisha uyafundisa. (The teacher is teaching.) Ngifunda incwadi. (I am reading a book.)'),
        choice('Esikoleni', "What does 'uthisha' mean?", ['Learner', 'Teacher', 'Book'], 1),
        choice('Esikoleni', "'Ngifunda incwadi' means:", ['I am reading a book.', 'I am writing a letter.', 'I am going home.'], 0),
        gap('Ekuseni', 'Ekuseni ngiya []. (In the morning I go to school.)', ['esikoleni']),
    ]),
    approvedTest('Emakethe: At the Market', 'zulu', 2, true, ['shopping', 'listening'], '2026-10-03', [
        text('Emakethe (At the market)',
            'Ngicela isinkwa. (May I have bread, please.) Kubiza malini? (How much does it cost?) Ngiyabonga kakhulu! (Thank you very much!)'),
        choice('Emakethe', "How do you ask 'How much does it cost?'", ['Uhlala kuphi?', 'Ngubani igama lakho?', 'Kubiza malini?'], 2),
        gap('Ukucela', '[] isinkwa. (May I have bread, please.)', ['Ngicela']),
        choice('Imali', "The seller says 'Kubiza amarandi amahlanu.' How much is it?", ['Five rand', 'Two rand', 'Ten rand'], 0),
        listen('Lalela: which greeting do you hear?', ['Hamba kahle', 'Sawubona', 'Ngiyabonga'], 1),
    ]),

    // ---- Level 2, English ----
    approvedTest('Animals on the Farm', 'english', 2, true, ['animals'], '2026-10-03', [
        text('On the farm', 'A farmer keeps cows, goats, sheep and chickens. The cows give milk and the chickens lay eggs.'),
        choice('The farm', 'Which animal lays eggs?', ['A cow', 'A chicken', 'A goat'], 1),
        gap('The farm', 'The cows give [].', ['milk']),
        choice('The farm', 'Who looks after the animals on a farm?', ['A teacher', 'A doctor', 'A farmer'], 2),
    ]),
    approvedTest('Asking for Directions', 'english', 2, false, ['directions', 'travel'], '2026-10-04', [
        text('Finding the station', 'Excuse me, where is the station? Go straight, then turn left at the bank.'),
        choice('Being polite', "What do you say to get a stranger's attention politely?", ['Excuse me', 'Go away', 'Hurry up'], 0),
        gap('Directions', 'Go straight, then [] left at the bank.', ['turn']),
        choice('Directions', 'Where do you turn left?', ['At the school', 'At the bank', 'At the station'], 1),
    ]),
    ...LEVEL_UP_TESTS,
];

export const SEED_CONTENT: ContentSeedItem[] = [...SEED_LESSONS, ...SEED_TESTS];

// Titles an earlier version of this seed used. They are removed so a database
// seeded before keeps no content labelled with the wrong language.
export const RETIRED_TITLES = [
    'Ndaa! Everyday Greetings in Tshivenda',
    'The Clever Tortoise (Ngano)',
];

// The different level 1 tests each demo learner has already passed: one fewer
// than TESTS_REQUIRED_PER_LEVEL, so passing one more live unlocks the level-up
// challenge. All isiZulu, the learners' target language; the child's are all
// child-friendly.
export const SEED_PASSED_TESTS: Record<'one_learner' | 'young_learner', string[]> = {
    one_learner: [
        'Izinombolo: Numbers 1 to 5',
        'Umndeni Wami: My Family',
    ],
    young_learner: [
        'Izinombolo: Numbers 1 to 5',
        'Imibala: Colours',
    ],
};

export async function seedDemo(dbPool: pg.Pool = pool): Promise<SeedSummary> {
    const defaultPassword = process.env.SEED_PASSWORD ?? '123456789';
    const passwordHash = await PasswordMethods.hashPassword(defaultPassword);

    let usersCreated = 0;
    let contentItemsSeeded = 0;
    let reviewsCreated = 0;

    console.log('Seeding demo data for LingoLearn...\n');

    // -------------------------------------------------------------------------
    // 1. Users of each role (Administrator, Moderator, Author, Learner, Guardian)
    // -------------------------------------------------------------------------
    const userIds: Record<string, number> = {};

    for (const u of SEED_USERS) {
        const key = u.email ?? u.username!;
        const existing = await dbPool.query<{ id: number }>(
            `SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (username IS NOT NULL AND username = $2)`,
            [u.email, u.username],
        );

        if (existing.rowCount && existing.rowCount > 0) {
            userIds[key] = existing.rows[0].id;
            await dbPool.query(
                `UPDATE users SET requires_guardian_link = $1, role = $2 WHERE id = $3`,
                [u.requiresGuardianLink ?? false, u.role, userIds[key]],
            );
            console.log(`  · User ${u.role} (${key}) already exists (ID: ${userIds[key]})`);
        } else {
            const inserted = await dbPool.query<{ id: number }>(
                `INSERT INTO users (username, first_name, last_name, email, role, requires_guardian_link, password_hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id`,
                [u.username, u.firstName, u.lastName, u.email, u.role, u.requiresGuardianLink ?? false, passwordHash],
            );
            userIds[key] = inserted.rows[0].id;
            usersCreated++;
            console.log(`  ✓ Created user ${u.role}: ${key} (ID: ${userIds[key]})`);
        }
    }

    // -------------------------------------------------------------------------
    // 2. Learner Settings & Guardian Linking
    // -------------------------------------------------------------------------
    if (userIds['one_learner']) {
        await dbPool.query(
            `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
             VALUES ($1, 'zulu', '2004-05-15', 'english', 15)
             ON CONFLICT (user_id) DO UPDATE SET
                 target_language = EXCLUDED.target_language,
                 daily_goal = EXCLUDED.daily_goal`,
            [userIds['one_learner']],
        );
        console.log('  ✓ Seeded learner settings for adult learner (one_learner, target: zulu)');
    }

    if (userIds['young_learner']) {
        await dbPool.query(
            `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
             VALUES ($1, 'zulu', '2017-08-20', 'english', 10)
             ON CONFLICT (user_id) DO UPDATE SET
                 target_language = EXCLUDED.target_language,
                 date_of_birth = EXCLUDED.date_of_birth,
                 daily_goal = EXCLUDED.daily_goal`,
            [userIds['young_learner']],
        );
        console.log('  ✓ Seeded learner settings for child learner (young_learner, target: zulu)');
    }

    if (userIds['one@guardian.test'] && userIds['young_learner']) {
        await dbPool.query(
            `INSERT INTO parent_child_links (guardian_id, learner_id)
             VALUES ($1, $2)
             ON CONFLICT (guardian_id, learner_id) WHERE unlinked_at IS NULL DO NOTHING`,
            [userIds['one@guardian.test'], userIds['young_learner']],
        );
        console.log('  ✓ Linked guardian (one@guardian.test) to child learner (young_learner)');

        // Active link code for demo
        await dbPool.query(
            `INSERT INTO parent_link_codes (code, learner_id, expires_at)
             VALUES ('DEMO01', $1, now() + interval '7 days')
             ON CONFLICT (code) DO UPDATE SET expires_at = now() + interval '7 days'`,
            [userIds['young_learner']],
        );
        console.log('  ✓ Generated demo link code: DEMO01');
    }

    // -------------------------------------------------------------------------
    // 3. Taxonomy: Reading Levels & Tags
    // -------------------------------------------------------------------------
    console.log('\nSeeding taxonomy...');

    let levelsSeeded = 0;
    for (const lvl of SEED_LEVELS) {
        await dbPool.query(
            `INSERT INTO levels (level_number, name, description, pass_mark)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (level_number) DO UPDATE SET
                 name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 pass_mark = EXCLUDED.pass_mark`,
            [lvl.levelNumber, lvl.name, lvl.description, lvl.passMark],
        );
        levelsSeeded++;
    }
    console.log(`  ✓ Verified ${levelsSeeded} reading levels with pass marks`);

    let tagsSeeded = 0;
    for (const tag of SEED_TAGS) {
        await dbPool.query(
            `INSERT INTO tags (name, tag_type, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (name) DO UPDATE SET
                 tag_type = EXCLUDED.tag_type,
                 description = EXCLUDED.description`,
            [tag.name, tag.tagType, tag.description],
        );
        tagsSeeded++;
    }
    console.log(`  ✓ Verified ${tagsSeeded} theme and assessment tags`);

    // Cache tag IDs by name
    const tagMap = new Map<string, number>();
    const allTags = await dbPool.query<{ id: number; name: string }>('SELECT id, name FROM tags');
    for (const row of allTags.rows) {
        tagMap.set(row.name, row.id);
    }

    // -------------------------------------------------------------------------
    // 4. Sample Content: Across all lifecycle stages
    // -------------------------------------------------------------------------
    console.log('\nSeeding sample content...');

    const authorId = userIds['one@author.test'];
    const moderatorId = userIds['one@moderator.test'];

    await seedListeningClip(authorId);

    const retired = await dbPool.query(
        `DELETE FROM content WHERE author_id = $1 AND title = ANY($2::text[])`,
        [authorId, RETIRED_TITLES],
    );
    if (retired.rowCount) console.log(`  ✓ Removed ${retired.rowCount} retired content item(s)`);

    const contentIds = new Map<string, number>();

    for (const story of SEED_CONTENT) {
        // A draft has never been submitted (version 0); everything else was submitted once.
        const version = story.status === 'draft' ? 0 : 1;
        const existing = await dbPool.query<{ id: number }>(
            `SELECT id FROM content WHERE author_id = $1 AND title = $2`,
            [authorId, story.title],
        );

        let contentId: number;

        if (existing.rowCount && existing.rowCount > 0) {
            contentId = existing.rows[0].id;
            await dbPool.query(
                `UPDATE content
                 SET status = $1, language = $2, child_friendly = $3, level = $4, content = $5, submitted_at = $6, version = $7
                 WHERE id = $8`,
                [story.status, story.language, story.childFriendly, story.level, JSON.stringify(story.pages), story.submittedAt ?? null, version, contentId],
            );
            console.log(`  · Content "${story.title}" updated (${story.status}, ID: ${contentId})`);
        } else {
            const inserted = await dbPool.query<{ id: number }>(
                `INSERT INTO content (author_id, status, title, language, child_friendly, level, content, submitted_at, version)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [authorId, story.status, story.title, story.language, story.childFriendly, story.level, JSON.stringify(story.pages), story.submittedAt ?? null, version],
            );
            contentId = inserted.rows[0].id;
            contentItemsSeeded++;
            console.log(`  ✓ Created content "${story.title}" (${story.status}, ID: ${contentId})`);
        }

        contentIds.set(story.title, contentId);

        // The tags are exactly the listed ones, so an edited list leaves no stale link.
        // They keep the listed order, as the builder reads the first as the theme.
        await dbPool.query(`DELETE FROM content_tags WHERE content_id = $1`, [contentId]);
        for (const [position, tagName] of story.tags.entries()) {
            const tagId = tagMap.get(tagName);
            if (tagId) {
                await dbPool.query(
                    `INSERT INTO content_tags (content_id, tag_id, position)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (content_id, tag_id) DO NOTHING`,
                    [contentId, tagId, position],
                );
            }
        }

        // Add moderation review record if applicable
        if (story.moderationReview && moderatorId) {
            const existingReview = await dbPool.query(
                `SELECT id FROM content_reviews WHERE content_id = $1 AND moderator_id = $2`,
                [contentId, moderatorId],
            );
            if (existingReview.rowCount === 0) {
                await dbPool.query(
                    `INSERT INTO content_reviews (content_id, moderator_id, decision, reason)
                     VALUES ($1, $2, $3, $4)`,
                    [contentId, moderatorId, story.moderationReview.decision, story.moderationReview.reason ?? ''],
                );
                reviewsCreated++;
            }
        }
    }

    // -------------------------------------------------------------------------
    // 5. Learner progress: both demo learners at level 1, one test short of the challenge
    // -------------------------------------------------------------------------
    console.log('\nSeeding learner progress...');
    let attemptsCreated = 0;

    for (const [username, titles] of Object.entries(SEED_PASSED_TESTS)) {
        const learnerId = userIds[username];
        if (!learnerId) continue;

        await dbPool.query(
            `INSERT INTO learner_levels (user_id, level_number, updated_at)
             VALUES ($1, 1, now())
             ON CONFLICT (user_id) DO UPDATE SET level_number = 1, updated_at = now()`,
            [learnerId],
        );
        // A challenge tried while rehearsing the demo must not leave a cooldown behind.
        await dbPool.query(`DELETE FROM level_challenges WHERE learner_id = $1`, [learnerId]);
        // Nor may tests taken while rehearsing count toward it: only the listed
        // passes are kept, so the demo always starts one test short.
        const keep = titles.map((title) => contentIds.get(title)).filter((id): id is number => id != null);
        await dbPool.query(
            `DELETE FROM test_attempts WHERE learner_id = $1 AND NOT (passed AND content_id = ANY($2::int[]))`,
            [learnerId, keep],
        );

        for (const [index, title] of titles.entries()) {
            const test = SEED_CONTENT.find((item) => item.title === title);
            const contentId = contentIds.get(title);
            if (!test || !contentId) throw new Error(`seeded attempt names unknown test "${title}"`);

            const already = await dbPool.query(
                `SELECT 1 FROM test_attempts WHERE learner_id = $1 AND content_id = $2 AND passed`,
                [learnerId, contentId],
            );
            if (already.rowCount) continue;

            const answers = rightAnswers(test.pages as ContentPages);
            const graded = gradeAnswers(test.pages as ContentPages, answers);
            await dbPool.query(
                `INSERT INTO test_attempts (content_id, learner_id, level, language, answers, total, score, percent, passed, submitted_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now() - make_interval(days => $9))`,
                [contentId, learnerId, test.level, test.language, JSON.stringify(answers),
                 graded.total, graded.score, graded.percent, titles.length - index],
            );
            attemptsCreated++;
        }
        console.log(`  ✓ ${username}: level 1, ${titles.length} of ${TESTS_REQUIRED_PER_LEVEL} level 1 tests passed`);
    }

    console.log('\n================================================================');
    console.log('✓ LingoLearn demo seeding complete!');
    console.log('----------------------------------------------------------------');
    console.log('  Accounts (password for all: ' + defaultPassword + '):');
    console.log('    • Administrator: one@admin.test');
    console.log('    • Moderator:     one@moderator.test');
    console.log('    • Author:        one@author.test');
    console.log('    • Adult Learner: one_learner   (username)');
    console.log('    • Child Learner: young_learner (username, guardian linked)');
    console.log('    • Guardian:      one@guardian.test (link code: DEMO01)');
    console.log(`  Both learners study isiZulu at level 1 with ${TESTS_REQUIRED_PER_LEVEL - 1} of ${TESTS_REQUIRED_PER_LEVEL} tests passed:`);
    console.log('  pass one more isiZulu level 1 test to unlock the level-up challenge.');
    console.log('================================================================\n');

    return {
        usersCreated,
        levelsSeeded,
        tagsSeeded,
        contentItemsSeeded,
        reviewsCreated,
        attemptsCreated,
    };
}

/** The answer a learner who knows the material gives to every question in a test. */
export function rightAnswers(pages: ContentPages): Answer[] {
    return questionBlocksOf(pages).map((block) => block.itemType === 'Fill in the Blank'
        ? String((block.value.accepted as string[])[0])
        : Number(block.value.correctOption));
}

/**
 * Puts the demo clip in the uploads folder, under a fixed name so a second run
 * overwrites rather than adds, with a sidecar naming the demo author so it shows
 * in their audio library. Missing fixture: a warning, not a failed seed.
 */
async function seedListeningClip(authorId: number): Promise<void> {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixture = [path.join(here, 'fixtures', SEED_CLIP.fixture), path.resolve(here, '../../scripts/fixtures', SEED_CLIP.fixture)]
        .find((candidate) => fs.existsSync(candidate));
    if (!fixture) {
        console.warn(`  ! Fixture ${SEED_CLIP.fixture} not found; listening questions will have no audio`);
        return;
    }

    const target = path.join(mediaDirectory('audio'), SEED_CLIP.filename);
    await fs.promises.copyFile(fixture, target);
    await fs.promises.writeFile(`${target}.meta.json`, JSON.stringify({
        filename: SEED_CLIP.filename,
        originalName: SEED_CLIP.fixture,
        title: SEED_CLIP.title,
        transcript: SEED_CLIP.transcript,
        uploaderId: authorId,
        uploadedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`  ✓ Demo clip ready at ${SEED_CLIP.fileUrl}`);
}

// CLI entry point
const isDirectRun = process.argv[1]?.endsWith('seedDemo.ts') || process.argv[1]?.endsWith('seedDemo.js');
if (isDirectRun) {
    seedDemo().then(async () => {
        await pool.end();
        process.exit(0);
    }).catch(async (err) => {
        console.error('Seed failed:', err);
        await pool.end();
        process.exit(1);
    });
}
