# Contributing

## JavaScript Codestyle

* Two spaces for indentation

```diff
  {
-     console.log('4 spaces')
+   console.log('2 spaces')
  }
```

* No semicolons

```diff
- console.log('hello');
+ console.log('hello')
```

* Space after keywords

```diff
- if(true) {}
+ if (true) {}
```

* No space after function name

```diff
  class Dog {
-   bark () { console.log('Woof!') }
+   bark() { console.log('Woof!') }
  }
```

* Prefer `const` over `let` over `var`

```diff
- var k = 2
- let k = 2
+ const k = 2

  console.log(k)
```

* Spaces between operators

```diff
- 2/4
+ 2 / 4
```

* No spaces after/before curly braces

```diff
- const obj = { a: 1, b: 2 }
+ const obj = {a: 1, b: 2}
```

* ...except when destructuring

```diff
- const {a, b, c} = obj
+ const { a, b, c } = obj
```

* Use trailing commas in multiline literals

```diff
  const arr = [
    1,
    2,
-   3
+   3,
  ]
```

## CSS Naming Conventions

This is essentially our own flavour of BEM.

* Use `.ComponentName` for components

```html
<style>
  .Button {
    color: var(--Button-fg);
    background: var(--Button-bg);
  }
</style>

<a class='Button'>Click me!</a>
```

* Use `&.\--modifier` for modifiers

```html
<style>
  .Button {
    color: var(--Button-fg);
    background: var(--Button-bg);

    &.\--invert {
      color: var(--Button-bg);
      background: var(--Button-fg);
    }
  }
</style>

<a class='Button --invert'>I'm more important</a>
```

* Use `&.is-state` for states (ie. temporary)

```html
<style>
  .Image {
    &.is-loading {
      /* ... */
    }
  }
</style>

<div class='Image is-loading'></div>
```

* Use `&-child` for children

```html
<style>
  .Message {
    &-author {
      /* ... */
    }

    &-content {
      /* ... */
    }
  }
</style>

<div class='Message --from-system'>
  <span class='Message-author'>
    System
  </span>

  <span class='Message-content'>
    <i>Sam</i> joined the channel.
  </span>
</div>
```

* Use prescriptive variable names

```diff
  :root {
-   --color-dark: #121212;
+   --Sidebar-bg: #121212;
  }
```
