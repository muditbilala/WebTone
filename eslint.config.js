import js from '@eslint/js'
import globals from 'globals'
export default [{
  languageOptions:{globals:{...globals.browser, ...globals.es2021}},
  rules:{...js.configs.recommended.rules}
}]
