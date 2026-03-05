import type { Config } from "@/types/config/config"
import {
  BLOCK_ATTRIBUTE,
  CONTENT_WRAPPER_CLASS,
  PARAGRAPH_ATTRIBUTE,
  WALKED_ATTRIBUTE,
} from "../../../constants/dom-labels"
import { FORCE_INLINE_TRANSLATION_TAGS } from "../../../constants/dom-rules"
import { isBlockTransNode, isHTMLElement, isTextNode, isTransNode } from "../../dom/filter"
import { translateNodes } from "./translation-modes"

export async function translateWalkedElement(
  element: HTMLElement,
  walkId: string,
  config: Config,
  toggle: boolean = false,
): Promise<void> {
  if (!toggle && element.querySelector(`.${CONTENT_WRAPPER_CLASS}`))
    return

  // if the walkId is not the same, return
  if (element.getAttribute(WALKED_ATTRIBUTE) !== walkId)
    return

  const promises: Promise<void>[] = []

  if (element.hasAttribute(PARAGRAPH_ATTRIBUTE)) {
    let hasBlockNodeChild = false

    for (const child of element.childNodes) {
      if (isHTMLElement(child) && child.hasAttribute(BLOCK_ATTRIBUTE)) {
        // Force-inline tags like <a>/<span> shouldn't split paragraphs
        // unless they contain meaningful block-like descendants (e.g. <br> or block content with text).
        if (FORCE_INLINE_TRANSLATION_TAGS.has(child.tagName)) {
          const blockDescendants = child.querySelectorAll(`[${BLOCK_ATTRIBUTE}]`)
          let hasMeaningfulBlockDescendant = false
          for (const blockEl of blockDescendants) {
            if (!isHTMLElement(blockEl))
              continue
            if (blockEl.tagName === "BR" || blockEl.textContent?.trim()) {
              hasMeaningfulBlockDescendant = true
              break
            }
          }
          if (!hasMeaningfulBlockDescendant) {
            continue
          }
        }
        hasBlockNodeChild = true
        break
      }
    }

    const computedStyle = window.getComputedStyle(element)
    const isFlexParent = computedStyle.display.includes("flex")

    if (!hasBlockNodeChild) {
      promises.push(translateNodes([element], walkId, toggle, config))
    }
    else {
      // prevent children change during iteration
      const children = Array.from(element.childNodes)
      let consecutiveInlineNodes: ChildNode[] = []
      for (const child of children) {
        if (isTransNode(child) && isBlockTransNode(child) && !isTextNode(child)) {
          // force the children to be block translation style unless the parent is a flex parent
          promises.push(translateNodes(consecutiveInlineNodes, walkId, toggle, config, !isFlexParent))
          consecutiveInlineNodes = []
          promises.push(translateWalkedElement(child, walkId, config, toggle))
        }
        else {
          consecutiveInlineNodes.push(child)
        }
      }

      if (consecutiveInlineNodes.length) {
        promises.push(translateNodes(consecutiveInlineNodes, walkId, toggle, config, !isFlexParent))
        consecutiveInlineNodes = []
      }
    }
  }
  else {
    for (const child of element.childNodes) {
      if (isHTMLElement(child)) {
        promises.push(translateWalkedElement(child, walkId, config, toggle))
      }
    }
    if (element.shadowRoot) {
      for (const child of element.shadowRoot.children) {
        if (isHTMLElement(child)) {
          promises.push(translateWalkedElement(child, walkId, config, toggle))
        }
      }
    }
  }
  // This simultaneously ensures that when concurrent translation
  // and external await call this function, all translations are completed
  await Promise.all(promises)
}
