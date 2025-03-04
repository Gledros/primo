import { get } from 'svelte/store'
import axios from 'axios'
import config from '../stores/config'
import * as stores from '../stores'

export const serverSites = {
  save: async (site) => {
    const { serverConfig } = get(config)
    let successful = false
    try {
      const res = await axios.post(
        `${serverConfig.url}/api/${site.id}.json`,
        {
          action: 'SAVE_SITE',
          payload: site
        },
        {
          headers: {
            Authorization: `Basic ${serverConfig.token}`,
          },
        }
      )
      if (res.data) {
        successful = true
      }
    } catch (e) {
      console.warn(e)
    }
    return successful
  },
}

let siteBeingEdited = null
export async function setActiveEditor(siteID) {
  if (siteBeingEdited === siteID) return
  siteBeingEdited = siteID
  const { serverConfig } = get(config)
  const res = await axios.post(
    `${serverConfig.url}/api/${siteID}.json`,
    {
      action: 'SET_ACTIVE_EDITOR',
      payload: {
        siteID,
        userID: 'a Primo Desktop user'
      }
    },
    {
      headers: {
        Authorization: `Basic ${serverConfig.token}`,
      },
    }
  )
  if (siteBeingEdited === siteID) {
    siteBeingEdited = null
    setActiveEditor(siteID)
  }
}

export async function addDeploymentToSite({
  siteID,
  deployment,
  activeDeployment,
}) {
  stores.sites.update((s) =>
    s.map((site) => {
      return site.id === siteID
        ? {
            ...site,
            deployments: [deployment, ...site.deployments],
            activeDeployment,
          }
        : site
    })
  )
}

export const hosts = {
  connect: async ({ name, token }) => {
    const endpoint = {
      vercel: 'https://api.vercel.com/www/user',
      netlify: 'https://api.netlify.com/api/v1/user',
    }[name]

    const { data } = await axios
      .get(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .catch((e) => {
        data: null
      })
    if (data) {
      stores.hosts.update((h) => {
        return [
          ...h,
          {
            name,
            token,
            // user: data.user,
          },
        ]
      })
    } else {
      window.alert('Could not connect to host')
    }
  },
  delete: (name) => {
    stores.hosts.update((hosts) => hosts.filter((p) => p.name !== name))
  },
}
