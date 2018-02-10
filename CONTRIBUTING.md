# Contributing

## Codestyle

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

* Spaces after/before curly braces

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
