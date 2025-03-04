<script lang="ts">
  import { cloneDeep, find, isEqual, chain as _chain, set as _set, get as _get, differenceWith as _differenceWith} from 'lodash-es';
  import HSplitPane from './HSplitPane.svelte';
  import { getPlaceholderValue, getEmptyValue } from '../../../utils';
  import ModalHeader from '../ModalHeader.svelte';
  import { PrimaryButton } from '../../../components/buttons';
  import { Tabs, Card } from '../../../components/misc';
  import FullCodeEditor from './FullCodeEditor.svelte';
  import { CodePreview } from '../../../components/misc';
  import RepeaterField from '../../../components/FieldTypes/RepeaterField.svelte';
  import GroupField from '../../../components/FieldTypes/GroupField.svelte';
  import {Field} from '../../../const'
  import FieldItem from './FieldItem.svelte'

  import {
    processCode,
    processCSS,
    wrapInStyleTags,
  } from '../../../utils';
  import { locale } from '../../../stores/app/misc';

  import { content, code as siteCode } from '../../../stores/data/draft';
  import {
    id as pageID,
    code as pageCode
  } from '../../../stores/app/activePage';
  import { showingIDE } from '../../../stores/app';
  import fieldTypes from '../../../stores/app/fieldTypes';
  import { Component } from '../../../const';
  import type { Component as ComponentType, Symbol as SymbolType, Field as FieldType } from '../../../const';
  import { getPageData } from '../../../stores/helpers';

  export let component:ComponentType|SymbolType = Component();
  export let header = {
    label: 'Create Component',
    icon: 'fas fa-code',
    button: {
      icon: 'fas fa-plus',
      label: 'Add to page',
      onclick: (component) => {
        console.warn('Component not going anywhere', component);
      },
    },
  };

  let localComponent:SymbolType = cloneDeep(component) // local copy of component to modify & save 
  let localContent = component.type === 'symbol' ? {} : getComponentContent($content) // local copy of component content to modify & save
  
  // component data w/ page/site data included (for compilation)
  $: data = {
    ...getPageData({ loc: $locale }),
    ...getSymbolPlaceholders(fields),
    ...(localContent[$locale])
  }

  function getSymbolPlaceholders(fields) {
    return _chain(fields).keyBy('key').mapValues(f => getPlaceholderValue(f)).value()
  }

  // parse component-specific content out of site content tree (keeping separate locales)
  function getComponentContent(siteContent): object {
    return _chain(Object.entries(siteContent)) 
      .map(([locale]) => ({
        locale,
        content: $content[locale][$pageID][localComponent.id] || {}
      }))
      .keyBy('locale')
      .mapValues('content')
      .value()
  }
  
  $: setupComponent($locale) // swap content out of on-screen fields
  function setupComponent(loc) {
    fields = getFieldValues(fields, loc)
  }

  // hydrate fields with content (placeholder if passed component is a Symbol)
  function getFieldValues(fields:Array<FieldType>, loc:string): Array<any> {
    return fields.map(field => ({
      ...field,
      value: component.type === 'symbol' ? getPlaceholderValue(field) : (localContent[loc]?.[field.key] || getEmptyValue(field))
    }))
  }


  // Ensure all content keys match field keys
  $: component.type !== 'symbol' && syncFieldKeys(fields) 
  $: component.type !== 'symbol' && syncLocales($content)

  function syncLocales(content) {
    // runs when adding new locale from ComponentEditor
    Object.keys(content).forEach((loc) => {
      if (!localContent[loc]) {
        localContent = {
          ...localContent,
          [loc]: localContent['en']
        }
      }
    })
  }

  function syncFieldKeys(fields) {
    removeNonexistantKeys() // delete keys from content that do not appear in fields
    addMissingKeys() // add keys that do

    function addMissingKeys() {
      let updatedContent = cloneDeep(localContent)
      fields.forEach(field => {
        if (localContent[$locale][field.key] === undefined) {
          console.log('DOES NOT EXIST, adding', field.key)
          Object.keys(localContent).forEach(loc => {
            updatedContent[loc][field.key] = getEmptyValue(field)
          })
        }
      })
      localContent = updatedContent
    }

    // Remove content when field deleted
    function removeNonexistantKeys() {
      let updatedContent = cloneDeep(localContent)
      Object.keys(localContent[$locale]).forEach((key) => {
        if (!find(fields, ['key', key])) {
          console.log('Value does not exist, deleting', key)
          Object.keys(localContent).forEach(loc => {
            delete updatedContent[loc][key]
          })
        } 
      })
      localContent = updatedContent
      refreshPreview()
    }
  }


  function saveLocalContent(): void {
    localContent = {
      ...localContent,
      [$locale]: {
        ...localContent[$locale],
        ..._chain(fields).keyBy('key').mapValues('value').value()
      }
    }
  }

  function saveLocalValue(property:'html'|'css'|'js'|'fields', value:any): void {
    if (property === 'fields') {
      localComponent.fields = value
      fields = getFieldValues(value, $locale)
    } else {
      localComponent.code[property] = value
    }
  }

  const allFieldTypes = [
    {
      id: 'repeater',
      label: 'Repeater',
      component: RepeaterField,
    },
    {
      id: 'group',
      label: 'Group',
      component: GroupField,
    },
    ...$fieldTypes,
  ];

  let loading = false;

  // raw code bound to code editor
  let rawHTML = localComponent.code.html;
  let rawCSS = localComponent.code.css;
  let rawJS = localComponent.code.js;

  // changing codes triggers compilation
  $: compileComponentCode({
    html: rawHTML,
    css: rawCSS,
    js: rawJS
  });

  // on-screen fields
  let fields = localComponent.fields;

  let componentApp; // holds compiled component
  let compilationError; // holds compilation error



  // ensure placeholder values always conform to form
  // TODO: do for remaining fields
  $: fields = fields.map(field => {
    if (component.type === 'symbol' && field.type === 'link' && !field.value?.url) return {
      ...field,
      value: getPlaceholderValue(field) 
    }
    else return field 
  })


  let disableSave = false;
  async function compileComponentCode({ html, css, js }) {
    disableSave = true;

    // automatically create fields for keys without fields
    // TODO: prevent creating multiple fields for the same key (e.g. when typing {} first then {heading})
    // account for keys passed down from page/site fields
    // allow user to delete fields, even if the key is still used in the html (i.e. don't recreate them)

    // const keys = html.match(/(?<=\{\s*).*?(?=\s*\})/gs) || []// extract keys 
    // const notInFields = keys.map(s => s.replace(/\s/g, '')).filter(s => !find(fields, ['key', s]))
    // notInFields.forEach(key => {
    //   addNewField({ 
    //     key,
    //     label: capitalize(key)
    //   })
    // })

    await compile();
    disableSave = false;

    async function compile() {
      const parentCSS = await processCSS($siteCode.css + $pageCode.css)
      const res = await processCode({
        code: {
          html: `${html}
      <svelte:head>
        ${$pageCode.html.head}
        ${$siteCode.html.head}
        ${wrapInStyleTags(parentCSS)}
      </svelte:head>
      ${$pageCode.html.below}
      ${$siteCode.html.below}
      `,
          css,
          js,
        },
        data,
        buildStatic: false,
      });
      compilationError = res.error;
      componentApp = res.js;
      saveLocalValue('html', html);
      saveLocalValue('css', css);
      saveLocalValue('js', js);
    }
  }

  // Functionality for handling fields

  function addNewField(fieldProps = {}) {
    saveLocalValue('fields', [
      ...fields,
      Field(fieldProps)
    ]);
  }

  function createSubfield({detail:field}) {
    const idPath = getFieldPath(fields, field.id)
    let updatedFields = cloneDeep(fields)
    handleSubfieldCreation(fields)

    function handleSubfieldCreation(fieldsToModify) {
      if (find(fieldsToModify, ['id', field.id])) { // field is at this level
        const newField = cloneDeep(field)
        newField.fields = [
          ...newField.fields,
          Field()
        ]
        _set(updatedFields, idPath, newField)
      } else { // field is lower
        fieldsToModify.forEach(field => handleSubfieldCreation(field.fields));
      }
    }

    saveLocalValue('fields', updatedFields);
  }

  function deleteField({detail:field}) {
    const idPath = getFieldPath(fields, field.id)
    let updatedFields = cloneDeep(fields)

    let parentField = _get(updatedFields, idPath.slice(0, -2))
    if (parentField) {
      handleDeleteSubfield(fields)
    } else {
      saveLocalValue('fields', fields.filter((f) => f.id !== field.id));
    }

    function handleDeleteSubfield(fieldsToModify) {
      if (find(fieldsToModify, ['id', parentField.id])) {
        const newField = cloneDeep(parentField)
        newField.fields = newField.fields.filter((f) => f.id != field.id)
        _set(updatedFields, idPath.slice(0, -2), newField)
      }
      else {
        fieldsToModify.forEach(field => handleDeleteSubfield(field.fields));
      }
      saveLocalValue('fields', updatedFields);
    }
  }

  function moveField({detail}) {
    const { field, direction } = detail
    const idPath = getFieldPath(fields, field.id)

    let updatedFields = cloneDeep(fields)

    handleFieldMove(fields)

    function handleFieldMove(fieldsToModify) {
      const indexToMove = fieldsToModify.findIndex(f => f.id === field.id)
      if (indexToMove > -1) { // field is at this level
        const withoutItem = fieldsToModify.filter((_, i) => i !== indexToMove);
        const newFields = {
            up: [
              ...withoutItem.slice(0, indexToMove - 1),
              field,
              ...withoutItem.slice(indexToMove - 1),
            ],
            down: [
              ...withoutItem.slice(0, indexToMove + 1),
              field,
              ...withoutItem.slice(indexToMove + 1),
            ],
          }[direction]
        if (idPath.length === 1) { // field is at root level
          updatedFields = newFields
        } else {
          const path = idPath.slice(0, -1) // modify 'fields' containing field being moved
          _set(updatedFields, path, newFields)
        }
      } else { // field is lower
        fieldsToModify.forEach(field => handleFieldMove(field.fields));
      }
    }

    saveLocalValue('fields', updatedFields)
  }

  function getFieldPath(fields, id) {
    for (const [i, field] of fields.entries()) {
      const result = getFieldPath(field.fields, id)
      if (result) {
        result.unshift(i, 'fields');
        return result
      } else if (field.id === id) {
        return [i]
      } 
    }
  }

  const tabs = [
    {
      id: 'code',
      label: 'Code',
      icon: 'code',
    },
    {
      id: 'fields',
      label: 'Fields',
      icon: 'database',
    },
  ];

  let activeTab = tabs[0];

  function getFieldComponent(field) {
    const fieldType = find(allFieldTypes, ['id', field.type]);
    if (fieldType && fieldType.component) {
      return fieldType.component;
    } else {
      return null;
    }
  }

  let editorWidth = localStorage.getItem('editorWidth') || '66%';
  let previewWidth = localStorage.getItem('previewWidth') || '33%';

  function refreshPreview() {
    compileComponentCode({
      html: rawHTML,
      css: rawCSS,
      js: rawJS
    })
  }

  function saveComponent() {

    const ExtractedComponent = (component) => ({
      ...component,
      content: localContent,
      fields: fields.map(field => ({
        id: field.id,
        key: field.key,
        label: field.label,
        type: field.type,
        fields: field.fields
      }))
    })

    if (!disableSave) {
      const component = ExtractedComponent(localComponent)
      header.button.onclick(component);
    }
  }

</script>

<ModalHeader
  {...header}
  warn={() => {
    if (!isEqual(localComponent, component)) {
      const proceed = window.confirm('Undrafted changes will be lost. Continue?');
      return proceed;
    } else return true;
  }}
  button={{ ...header.button, onclick: saveComponent, disabled: disableSave }}>
</ModalHeader>

<main>
  <HSplitPane
    leftPaneSize={editorWidth}
    rightPaneSize={previewWidth}
    styleLeft="overflow: { $showingIDE ? 'hidden' : 'scroll' }"
    on:resize={({ detail }) => {
      const { left, right } = detail;
      localStorage.setItem('editorWidth', left);
      localStorage.setItem('previewWidth', right);
    }}>
    <div slot="left" lang={$locale}>
      {#if $showingIDE}
        <Tabs {tabs} bind:activeTab />
        {#if activeTab === tabs[0]}
          <FullCodeEditor
            variants="flex-1"
            bind:html={rawHTML}
            bind:css={rawCSS}
            bind:js={rawJS}
            on:save={saveComponent} />
        {:else if activeTab === tabs[1]}
          <div class="fields">
            {#each fields as field, i}
              <Card id="field-{i}">
                <FieldItem 
                  bind:field
                  isFirst={i === 0}
                  isLast={i === fields.length - 1}
                  on:delete={deleteField}
                  on:move={moveField}
                  on:createsubfield={createSubfield}
                  on:input={refreshPreview}
                />
              </Card>
            {/each}
            <PrimaryButton icon="fas fa-plus" on:click={addNewField}>
              Create a Field
            </PrimaryButton>
          </div>
        {/if}
      {:else}
        <div>
          {#each fields as field (`${field.id}-${$locale}`)} 
            {#if field.key && getFieldComponent(field)}
              <div
                class="field-item"
                class:repeater={field.key === 'repeater'}
                id="field-{field.key}">
                <svelte:component
                  on:input={() => {
                    fields = fields.filter(Boolean) // to trigger setting `data`
                    saveLocalContent()
                  }}
                  this={getFieldComponent(field)}
                  {field} />
              </div>
            {:else if getFieldComponent(field)}
              <div class="invalid-field">
                <span>This field needs a key in order to be valid</span>
              </div>
            {/if}
          {:else}
            <p class="empty-description">
              You'll need to create and integrate a field before you can edit
              this component's content from here
            </p>
          {/each}
        </div>
      {/if}
    </div>
    <div slot="right">
      <CodePreview
        view="small"
        {loading}
        {componentApp}
        {data}
        error={compilationError} />
    </div>
  </HSplitPane>
</main>

<style lang="postcss">
  main {
    display: flex; /* to help w/ positioning child items in code view */
    background: var(--primo-color-black);
    color: var(--color-gray-2);
    padding: 0.5rem;
    padding-top: 0;
    flex: 1;
    overflow: hidden;

    --PrimaryButton-bg: var(--color-gray-8);
    --PrimaryButton-bg-hover: var(--color-gray-9);

    .empty-description {
      color: var(--color-gray-4);
      font-size: var(--font-size-2);
      text-align: center;
      height: 100%;
      display: flex;
      align-items: flex-start;
      padding: 6rem;
      justify-content: center;
      margin-top: 12px;
    }
  }

  .field-item {
    padding: 1rem;
    box-shadow: var(--box-shadow);
    margin-bottom: 0.5rem;
    background: var(--color-gray-9);
  }

  [slot="right"] {
    width: 100%;
  }

</style>
