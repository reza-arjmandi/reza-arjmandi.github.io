---
layout: post
title:  "C++20 Coroutines, Async Generator!"
date:   2020-03-22 12:55:47 +0430
categories: C++20 Coroutines
---
Async generator is very similar to `generator` and can produce a sequence of
values lazily, but ‍`async_generator` is different from `generator` in that
values also can be produced asynchronously.
In the `generator` coroutine body, we only can use `co_yield` operator, but in
the `async_generator` coroutine body, we can use `co_yield` and `co_await`
operators.
Take a look at the following simple example.

```c++
cppcoro::async_generator<int> ticker(int count, threadpool& tp)
{
  for (int i = 0; i < count; ++i)
  {
    co_await tp.delay(std::chrono::seconds(1));
    co_yield i;
  }
}

cppcoro::task<> consumer(threadpool& tp)
{
  auto sequence = ticker(10, tp);
  for co_await(std::uint32_t i : sequence)
  {
    std::cout << "Tick " << i << std::endl;
  }
}
```

In the consumer task a `for co_await` range_based for-loop is used to consume
values of `sequence`. And also in the `ticker` a `co_await` operator is used to
waiting asynchronously.  
`async_generator` class has an iterator type and also `begin` and `end`
functions were implemented in order to be used in the range_based for-loop.

```c++
template<typename T>
class async_generator
{
public:

    class iterator
    {
        //...
    };

    Awaitable<iterator> begin() noexcept;
    iterator end() noexcept;
};
```

When the `begin` function is called, it returns an awaitable object. This
awaitable object must be awaited to get the iterator.

```c++
class iterator
{
public:
    //...
    Awaitable<iterator&> operator++() noexcept;
};
```

When the `iterator` is incremented, it returns an awaitable object. This
awaitable object must be awaited to resume the coroutine if the coroutine is
suspended.
If the coroutine runs to completion then the `iterator` will subsequently become
equal to the `end()` iterator. If the coroutine completes with an unhandled
exception then that exception will be rethrown from the `co_await` expression.
If you don’t know about awaitable objects, I recommend watching one of my
previous videos about implementing a generator, task class or recursive
generator. You can find these videos in my YouTube channel.
When the `async_generator` object is destructed it requests cancellation of the
underlying coroutine. If the coroutine has already run to completion or is
currently suspended in a `co_yield` expression then the coroutine is destroyed
immediately. Otherwise, the coroutine will continue execution until it either
runs to completion or reaches the next `co_yield` expression.  
Let's check two interesting test cases from `cppcoro`, it's very useful, it help
us to understand how to use `async_generator` and usages.

## First Test Case

```c++
#include "doctest/doctest.h"

TEST_SUITE_BEGIN("async_generator");

TEST_CASE("async producer with async consumer"
 * doctest::description{
  "This test tries to cover the different state-transition code-paths\n"
  "- consumer resuming producer and producer completing asynchronously\n"
  "- producer resuming consumer and consumer requesting next value synchronously\n"
  "- producer resuming consumer and consumer requesting next value asynchronously" })
{
    // ...
}

TEST_SUITE_END();
```

The `doctest` framework is used to implement test cases. It's a single-header
testing framework for unit tests and TDD. It's very fast and feature-rich.
This test case shows a simple example of asynchronous programming by coroutines
and `task` class. This test case implements a simple producer-consumer scenario
by `async_generator`, `task` and `single_consumer_event`.  
Let's see the test body.

```c++
    //...
    cppcoro::single_consumer_event p1;
    cppcoro::single_consumer_event p2;
    cppcoro::single_consumer_event p3;
    cppcoro::single_consumer_event c1;
    //...
```

At first four objects from the `single_consumer_event` class are created to
synchronize producer and consumer. Three first objects (p1, p2 and p3) will be
used by the producer, and the last object (c1) will be used by the consumer.  

```c++
//...
auto produce = [&]() -> cppcoro::async_generator<std::uint32_t>
{
    co_await p1;
    co_yield 1;
    co_await p2;
    co_yield 2;
    co_await p3;
};
//...
```

Then the producer is implemented as a lambda function. The return type of lambda
function is an object from `async_generator` and it causes this lambda
function to turn into a coroutine. So it can use `co_await` and `co_yield`
operators in its body.  
Producer generates values in an asynchronous manner. Every time that it
co_awaits `p1`, `p2` or `p3` objects, it's suspended. And the producer will be
resumed by calling the `set()` function of event objects (`p1`, `p2` and `p3`)
asynchronously.  
Let's see the consumer.

```c++
//...
bool consumerFinished = false;

auto consume = [&]() -> cppcoro::task<>
{
    auto generator = produce();
    auto it = co_await generator.begin();
    CHECK(*it == 1u);
    (void)co_await ++it;
    CHECK(*it == 2u);
    co_await c1;
    (void)co_await ++it;
    CHECK(it == generator.end());
    consumerFinished = true;
};
//...
```

Also consumer is implemented as a lambda function. The return type of lambda
function is an object from `task` and it causes this lambda function to turn
into a coroutine. If you don't know about `task`, I recommend watching one of
my previous videos about implementing the `task` class. you can find this video
in my YouTube channel.  
In the `consumer`, first an object from the producer is created, then `begin()`
function is called, this function returns an awaitable object. then awaitable
object is awaited, and it causes the producer to be resumed till the producer
reaches a `co_yield` operator and suspended, finally `begin()` function returns
an `iterator` object.  
Consumer can access to the values of generator by dereference the `iterator`
object.  
Producer is resumed by co_awaiting the `operator++()` of the `iterator` object.
Let's execute the producer and consumer tasks.  

```c++
//...
auto unblock = [&]() -> cppcoro::task<>
{
    p1.set();
    p2.set();
    c1.set();
    CHECK(!consumerFinished);
    p3.set();
    CHECK(consumerFinished);
    co_return;
};

cppcoro::sync_wait(cppcoro::when_all_ready(consume(), unblock()));
```

The `when_all_ready` function is used to create a new awaitable that completes
when all of the input awaitables complete. Then returned awaitable is
passed to the `sync_wait` function. The `sync_wait` function is used to
synchronously wait till the specified awaitable completes. The specified
awaitable will be `co_await`ed on current thread. The `unblock` task is created
to set events, and resumes suspended tasks.  

## Second Test Case

```c++
TEST_CASE("fmap")
{
    // ...
}
```

This test case shows the `fmap` function usages in conjunction with
`async_generator`. Let's see the test body.  

```c++
// ...
using cppcoro::async_generator;
using cppcoro::fmap;

auto iota = [](int count) -> async_generator<int>
{
  for (int i = 0; i < count; ++i)
  {
    co_yield i;
  }
};
```

The `iota` function is declared as a lambda function, and it's return type is an
object from `async_generator<int>` and it causes this lambda function to turn
into a coroutine. `iota` is a generator that generates a sequence of values
lazily.  

```c++
// ...
auto squares = iota(5) | fmap([](auto x) { return x * x; });
```

Firstly an object from the generator is created by calling the `iota`
function, then `fmap` function is used to apply the specified lambda function to
the values of the generator. It seems very interesting with pipe notation.
Now the `squares` is a new generator object that its values result from
applying the lambda function to the `iota` generator.  

```c++
//...
cppcoro::sync_wait([&]() -> cppcoro::task<>
{
  auto it = co_await squares.begin();
  CHECK(*it == 0);
  CHECK(*co_await ++it == 1);
  CHECK(*co_await ++it == 4);
  CHECK(*co_await ++it == 9);
  CHECK(*co_await ++it == 16);
  CHECK(co_await ++it == squares.end());
}());
```

Finally, a task object is created to run the `squares` generator and also check
it's values. You see the values result from applying the lambda function to the
`iota` generator.

Check out the [this video][C++20 coroutines, async generator] if you want to
learn how it work. Also you can access to the slides through this
[link][slides]. 

[C++20 coroutines, async generator]: https://youtu.be/4xBbuOu2kig
[slides]:   https://docs.google.com/presentation/d/1oN16fJMjkyHxOETjAGNVjzwoYRoJS5Gb8pNdNeIHG6I/edit?usp=sharing
