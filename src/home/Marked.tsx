import { Fragment } from 'react'
import { markedParts } from './drillModel'

/**
 * 問題文の下線部（ラボドリの <u> … </u>）を引いて出す。
 * 問題文を HTML として解釈せず、下線のところだけを <u> に置き換えるので、
 * ほかのタグらしい文字が混ざっていても画面は壊れない。
 */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {markedParts(text).map((p, i) => (
        <Fragment key={i}>{p.underline ? <u>{p.text}</u> : p.text}</Fragment>
      ))}
    </>
  )
}
