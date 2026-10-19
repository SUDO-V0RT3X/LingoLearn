<script setup lang="ts">
import { MAX_ANSWER_LENGTH } from '@/core/limits'

//The list of answers a learner picks from, and the mark on the right one.
//Multiple choice and listen and choose both ask exactly this, so both use it.
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n();

const options = defineModel<string[]>('options', {default:() => ['','']});
const correctOption = defineModel<number>('correctOption', {default:0});

//editable shows input fields; otherwise the answers render as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

//A question needs two answers to be a choice, and more than six is a wall of text.
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

//One radio group per block, so two questions on a page do not share a selection.
const groupName = useId();

//Writes one answer back, leaving the rest as they are.
function writeOption(index:number, text:string){
    options.value = options.value.map((option,at) => at === index ? text : option);
}

function addOption(){
    if (options.value.length >= MAX_OPTIONS) return;
    options.value = [...options.value, ''];
}

//Drops an answer, keeping the mark on the same words. Removing the marked
//answer itself moves the mark to the one that takes its place.
function removeOption(index:number){
    if (options.value.length <= MIN_OPTIONS) return;
    options.value = options.value.filter((_,at) => at !== index);
    if (correctOption.value >= index && correctOption.value > 0) correctOption.value = correctOption.value - 1;
}

</script>

<template>
    <!-- One row per answer: the radio marks the right one, the box holds the words. -->
    <div v-if="editable" class="choiceOptions">
        <span class="choiceOptions__label">{{ t('builder.choice.answers') }}</span>
        <div class="choiceOptions__list">
            <div v-for="(option,index) in options" :key="index" class="choiceOption">
                <input class="choiceOption__correct" type="radio" :name="groupName"
                       :value="index" :checked="correctOption === index"
                       :aria-label="t('builder.choice.markCorrect', {n: index + 1})"
                       @change="correctOption = index">
                <input class="choiceOption__input" type="text" :value="option" :maxlength="MAX_ANSWER_LENGTH"
                       :placeholder="t('builder.choice.answer', {n: index + 1})"
                       :aria-label="t('builder.choice.answer', {n: index + 1})"
                       @input="writeOption(index,($event.target as HTMLInputElement).value)">
                <button type="button" class="choiceOption__remove" :title="t('builder.choice.removeThis')"
                        :aria-label="t('builder.choice.remove', {n: index + 1})"
                        :disabled="options.length <= MIN_OPTIONS" @click="removeOption(index)">×</button>
            </div>
        </div>
        <button type="button" class="choiceOptions__add"
                :disabled="options.length >= MAX_OPTIONS" @click="addOption">{{ t('builder.choice.add') }}</button>
        <p class="choiceOptions__hint">{{ t('builder.choice.hint') }}</p>
    </div>

    <!-- Read only: the answers as an author or moderator reads them, right one marked. -->
    <ol v-else-if="options.length" class="choiceBlockPreview__options">
        <li v-for="(option,index) in options" :key="index"
            :class="['choiceBlockPreview__option',{'choiceBlockPreview__option--correct':correctOption === index}]">
            <span v-if="correctOption === index" class="choiceBlockPreview__tick" aria-hidden="true">✓</span>
            <span :class="{'choiceBlockPreview__missing':!option}">{{ option || t('builder.choice.empty') }}</span>
            <span v-if="correctOption === index" class="choiceBlockPreview__correctLabel">{{ t('builder.choice.rightAnswer') }}</span>
        </li>
    </ol>
    <p v-else class="choiceBlockPreview__missing">{{ t('builder.choice.noAnswers') }}</p>
</template>

<style scoped>
/* Laid out like the other block fields: the label in the left column. */
.choiceOptions{
    display: grid;
    grid-template-columns: var(--block-label-width, 88px) minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: var(--space-2);
    align-items: start;
    min-width: 0;
    margin-top: var(--space-1);
}
.choiceOptions__label{
    padding-top: 10px;
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.choiceOptions > .choiceOptions__add,
.choiceOptions > .choiceOptions__hint{ grid-column: 2; }
.choiceOptions__list{
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
}
.choiceOption{
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}
.choiceOption__correct{
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--success);
    cursor: pointer;
}
.choiceOption__input{
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 6px 10px;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-sm);
    transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.choiceOption__input::placeholder{ color: var(--ink-3); }
/* The answer marked right is tinted, so the mark reads at a glance. */
.choiceOption__correct:checked + .choiceOption__input{
    border-color: var(--success);
    background: var(--success-soft);
}
.choiceOption__input:focus,
.choiceOption__correct:checked + .choiceOption__input:focus{
    outline: none;
    border-color: var(--primary);
    background: var(--surface);
    box-shadow: var(--focus-ring);
}
.choiceOption__remove{
    flex: none;
    width: 30px;
    height: 30px;
    font: inherit;
    font-size: var(--text-md);
    line-height: 1;
    color: var(--ink-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
}
.choiceOption__remove:hover:not(:disabled){ color: var(--danger); background: var(--danger-soft); }
.choiceOption__remove:disabled{
    cursor: not-allowed;
    opacity: .35;
}
.choiceOptions__add{
    justify-self: start;
    min-height: 32px;
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--primary);
    background: transparent;
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color .15s ease, background .15s ease;
}
.choiceOptions__add:hover:not(:disabled){ border-color: var(--primary); background: var(--primary-soft); }
.choiceOptions__add:disabled{
    cursor: not-allowed;
    opacity: .45;
}
.choiceOptions__hint{
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-3);
}

.choiceBlockPreview__options{
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    counter-reset: answer;
}
.choiceBlockPreview__option{
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: 6px var(--space-3);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    overflow-wrap: anywhere;
}
.choiceBlockPreview__option--correct{
    color: var(--ink);
    font-weight: 600;
    background: var(--success-soft);
    border-color: transparent;
}
.choiceBlockPreview__tick{
    flex: none;
    color: var(--success);
}
.choiceBlockPreview__correctLabel{
    margin-left: auto;
    padding-left: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--success);
}
.choiceBlockPreview__missing{
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 400;
    font-style: italic;
    color: var(--ink-3);
}

</style>
