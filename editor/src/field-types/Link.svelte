<script>
  import { createEventDispatcher } from 'svelte';

  import { find } from 'lodash-es';
  import SplitButton from '../ui/inputs/SplitButton.svelte';
  import TextInput from '../components/inputs/TextInput.svelte';
  import { pages } from '../stores/data/draft';
  import {locale} from '../stores/app/misc'

  const link = {
    label: '',
    url: '',
    active: false,
  };

  export let field = {
    value: link,
  };

  if (!field.value) {
    field.value = link;
  }

  $: if (typeof field.value === 'string' || !field.value) {
    field.value = {
      label: '',
      url: '',
      active: false,
    };
  } else if (field.value.title && !field.value.label) {
    // Fix old values using `title` instead of `label`
    field.value = {
      ...field.value,
      label: field.value.title,
    };
  }

  let selected = urlMatchesPage(field.value.url);

  function urlMatchesPage(url) {
    if (url.startsWith('/')) {
      return 'Page';
    } else {
      return 'URL';
    }
  }

  function getPageUrl(page, loc) {
    const prefix = loc === 'en' ? '/' : `/${loc}/`
    let url
    if (page.id === 'index') {
      return prefix
    } else {
      return prefix + page.id
    } 
  }

</script>

<div class="link">
  <span>{field.label}</span>
  <div class="inputs">
    <TextInput
      on:input
      bind:value={field.value.label}
      id="page-label"
      label="Label"
      placeholder="About Us" />
    <div class="url-select">
      <SplitButton bind:selected buttons={[{ id: 'Page' }, { id: 'URL' }]} />
      {#if selected === 'Page'}
        <select bind:value={field.value.url}>
          {#each $pages as page}
            <option value={getPageUrl(page, $locale)}>
              {page.name}
              <pre>({getPageUrl(page, $locale)})</pre>
            </option>
          {/each}
        </select>
      {:else}
        <TextInput
          on:input
          bind:value={field.value.url}
          type="url"
          placeholder="about-us" />
      {/if}
    </div>
  </div>
</div>
<slot />

<style lang="postcss">
  .link {
    display: flex;
    flex-direction: column;

    span {
      font-size: var(--font-size-1);
      font-weight: 600;
    }

    .inputs {
      display: flex;
      flex-direction: column;
      width: 100%;
      --TextInput-mt: 0.25rem;

      .url-select {
        display: flex;
        flex-direction: column;

        select {
          background-image: url("data:image/svg+xml;utf8,<svg fill='white' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
          background-position: 100%;
          background-repeat: no-repeat;
          appearance: none;
          padding: 0.75rem;
          padding-right: 0;
          border: 0;
          background-color: var(--color-gray-8);
          margin-top: 0.25rem;
        }
      }
    }
  }

</style>
