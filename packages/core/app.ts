import { EntitySystem } from './entity'
import { Script, ScriptLifecycle } from './script'
import { EventBus } from './eventbus'
import { PIKA_EVENT } from './const'
import { Component } from './component'
import { TickerOptions, Ticker } from './ticker'

export interface PikaOptions extends TickerOptions {
  /**
   * Whether to use the built-in ticker.
   * 是否使用内置的计时器
   */
  useTicker?: boolean
}

/**
 * The main class of the application,
 * controls lifecycle and registers components, services, etc.
 */
export class Pika extends EventBus {
  /**
   * Event types.
   * 事件列表
   */
  static EVENT = PIKA_EVENT

  /**
   * Get the current status of the application.
   */
  private _state: PIKA_EVENT = PIKA_EVENT.SHUT

  /**
   * Get the current status of the application.
   */
  get state () {
    return this._state
  }

  /**
   * Set the current status of the application.
   */
  set state (val: PIKA_EVENT) {
    if (val === this._state) return

    // Update the status.
    this._state = val

    // Emit the status change event.
    this.emit(val)
  }

  /**
   * Component manager.
   * 组件管理器
   */
  readonly Component = new Component()

  /**
   * Entity system.
   * 实体系统
   */
  readonly Entity = new EntitySystem()

  /**
   * Registered scripts.
   * 已注册的脚本列表
   */
  readonly scripts: Array<Partial<Script> & ScriptLifecycle> = []


  constructor (options: PikaOptions = {}) {
    super()
    this.script(this.Component)
    this.script(this.Entity)
    // Add ticker if needed.
    if (options.useTicker) {
      this.script(new Ticker(options))
    }
  }

  /**
   * Create an entity.
   */
  entity () {
    // create base entity
    const entity = this.Entity.create()

    // add component interface to entity
    this.Component.observe(entity)

    return entity
  }

  /**
   * Register component. Only registered components can be observed in the system.
   * Component data will be initialized using the constructor if provided.
   * 注册组件，只有注册过的组件在能在System中被观测到。
   * 如果指定了构造器，在每个Entity添加组件时，会使用构造器初始化组件实例。
   * @param name The name of the component.
   * @param constructor The constructor of the component.
   */
  component (name: string, constructor?: any) {
    return this.Component.register(name, constructor)
  }

  /**
   * Register script. Script is the basic logic unit of the application.
   * 注册脚本。脚本提供了应用的基本逻辑单元。
   * @param script
   */
  async script (script: Partial<Script> & ScriptLifecycle) {
    if (!script) return

    if (this.state === PIKA_EVENT.INIT) {
      throw new Error('[Pika] Please register the script after the application is initialized.')
    }

    // default actived
    if (script.actived === undefined) {
      script.actived = true
    }

    // inject app
    script.app = this

    // Install the script.
    script.onInstalled?.()

    if (this.state === PIKA_EVENT.RUNNING) {
      await script.onLoad?.()
      await script.onLoaded?.()
    }

    this.scripts.push(script)
  }

  /**
   * Start the application.
   */
  async start () {
    switch (this.state) {
      case PIKA_EVENT.SHUT: {
        this.state = PIKA_EVENT.INIT
        await Promise.all(this.scripts.map(script => script.onLoad?.()))
        this.state = PIKA_EVENT.RUNNING
        await Promise.all(this.scripts.map(script => script.onLoaded?.()))
        return
      }
      case PIKA_EVENT.STOP: {
        await Promise.all(this.scripts.map(script => script.onResume?.()))
        this.state = PIKA_EVENT.RUNNING
        return
      }
    }
  }

  /**
   * Called when the application is updated.
   * @param deltaTime
   */
  update (deltaTime: number) {
    if (this.state !== PIKA_EVENT.RUNNING) {
      return
    }

    // Update phase.
    this.scripts.forEach(script => script.actived && script.onUpdate?.(deltaTime))

    // Late update phase.
    this.scripts.forEach(script => script.actived && script.onLateUpdate?.())
  }

  /**
   * Stop the application.
   */
  async stop () {
    if (this.state !== PIKA_EVENT.RUNNING) {
      return
    }

    await Promise.all(this.scripts.map(script => script.onStop?.()))
    this.state = PIKA_EVENT.STOP
  }

  /**
   * Destroy the application.
   */
  async destroy () {
    await this.stop()
    await Promise.all(this.scripts.map(script => script.onDestroy?.()))
    this.scripts.splice(0, this.scripts.length)
  }
}
