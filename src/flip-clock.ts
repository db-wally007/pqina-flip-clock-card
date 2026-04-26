//
// flip-clock.ts by Tobias Wiedenmann https://github.com/Thyraz
//
// Home Assistant cumstom dashboard card for the PQINA "Flip" clock
//
// LINK TO ORIGINAL 'PQINA flip' REPOSITORY: https://github.com/pqina/flip
//
// Also thanks to Elmar Hinz for his HA development tutorials:
// https://github.com/home-assistant-tutorials/01.development-environment
//

import { html, LitElement } from "lit";
import { state } from "lit/decorators/state";
import { styles } from "./flip-clock.styles";
import { HomeAssistant, LovelaceCardConfig, ActionConfig, FrontendLocaleData } from "custom-card-helpers";

import Tick from '@pqina/flip';

// HA config object
interface Config extends LovelaceCardConfig {
  showSeconds: boolean;
  showAmPm: boolean;
  twentyFourHourFormat: boolean;
  hideBackground: boolean;
  styles: Styles;
  entity: string
  tap_action: ActionConfig;
}

interface HassEvent extends Event {
  detail
}

interface LocaleSettings extends FrontendLocaleData {
  time_zone: string;
}

// Available CSS options for the card
type Styles = {
  width: string;
  height: string;
  font: string;
  fontSize: string;
  secondsFontSize: string;
  amPmFontSize: string;
  dividerColor: string;
  dividerFontSize: string;
  textColor: string;
  textOffsetHorizontal: string;
  textOffsetVertical: string;
  frontFlapColor: string;
  frontFlapGradientOpacity: string;
  frontFlapShadowOpacity: string;
  rearFlapColor: string;
  rearFlapVerticalOffset: string;
}

// View definition for the PQINA Tick/Flip library
type FlipView = {
  view: string;
  key: string;
  transform?: string;
  className?: string;
}

// Value object for updating the flip-clock
type ClockValue = {
  hours: number;
  minutes: number;
  seconds: number;
  period: string;
  div1: string;
  div2: string;
}

// The Flip-Clock custom element
export class PqinaFlipClock extends LitElement {
  @state() private config: Config;

  // private properties
  private _hass: HomeAssistant;
  private _tick;
  private _timer;

  // required by HA
  setConfig(config: Config) {
    this.config = config;
    // call set hass() to immediately adjust to a changed entity
    // while editing the entity in the card editor
    if (this._hass) {
      this.hass = this._hass;
    }

    if (!this._tick) {
      this.setup();
    }
  }

  // required by HA
  set hass(hass: HomeAssistant) {
    this._hass = hass;
  }

  // Load styles using LitElement
  static styles = styles;

  // Add tap listener
  constructor() {
    super();
    this.addEventListener('click', (e) => this.handleTapAction(this.config));
  }

  // Create and configure the PQINA flip clock
  setup() {
    // Setup 'flip' subviews with colon dividers
    const views: any[] = [
      { view: 'flip', transform: 'pad(00)', key: 'hours' },
      { view: 'text', key: 'div1', className: 'divider' },
      { view: 'flip', transform: 'pad(00)', key: 'minutes' }
    ];
    if (this.config.showSeconds == true) {
      views.push({ view: 'text', key: 'div2', className: 'divider' });
      views.push({ view: 'flip', transform: 'pad(00)', key: 'seconds', className: 'seconds' });
    }

    // Setup AM/PM flip view
    if (this.config.showAmPm == true) {
      views.push({ view: 'flip', key: 'period', className: 'ampm' });
    }

    // Create the main flip-clock object
    this._tick = Tick.DOM.create({
      credits: false,
      view: {
        children: [{
          root: 'div',
          layout: 'horizontal fill',
          children: views
        }]
      },
      didInit: (tick) => {
        // Add timer to update the clock each second
        this._timer=Tick.helper.interval(
          () => {
            tick.value = this.getClockValue();
          }
        );
      }
    });
  }

  // Lit callback where we (re)start the timer when the clock is shown (again)
  connectedCallback() {
    super.connectedCallback();
    this._timer?.reset();
  }

  // Lit callback where we stop the timer when the clock is removed
  disconnectedCallback() {
    super.disconnectedCallback();
    this._timer?.stop();
  }

  // Lit callback for the HTML template
  render() {
    return html`
      <ha-card>
        <div class="card-content">
          <div class="clock"></div>
        </div>
      </ha-card>
    `;
  }

  // Lit callback when the HTML template was loaded / updated
  updated() {
    // HTML template re-created? Add clock to new parent
    const parent = this._tick.root.parentNode;
    if (parent) {
      parent.removeChild(this._tick.root);
    }
    this.shadowRoot.querySelector('.clock').appendChild(this._tick.root);

    this.updateCssVars();
  }

  // Apply the CSS vars according the config options set by the user
  updateCssVars() {
    const card: HTMLElement = this.shadowRoot.querySelector('ha-card');
    card.style.setProperty('--ha-card-border-color', this.config.hideBackground ? 'transparent' : '');
    card.style.setProperty('--ha-card-background', this.config.hideBackground ? 'transparent' : '');

    // Set default height and font-size based on the showSeconds and showAmPm settings
    const hasExtras = this.config.showSeconds || this.config.showAmPm;
    card.style.setProperty('--height', hasExtras ? '30cqw' : '45cqw');
    card.style.setProperty('--font-size', hasExtras ? '20cqw' : '30cqw');

    const cardContent: HTMLElement = this.shadowRoot.querySelector('.card-content');

    if (this.config.styles) {
      Object.entries(this.config.styles).forEach(([key, value]) => {
        const kebapCaseKey = key.replace(/([a-zA-Z])(?=[A-Z])/g,'$1-').toLowerCase()
        cardContent.style.setProperty(`--${kebapCaseKey}`, value || "");
      });

      // Calculate main-font-relative values so seconds/ampm flip animation
      // and rear flap shadow match the main clock proportions
      const mainFontSize = this.config.styles.fontSize;
      if (mainFontSize) {
        const parsed = parseFloat(mainFontSize);
        if (!isNaN(parsed)) {
          const unit = mainFontSize.replace(String(parsed), '').trim() || 'px';
          cardContent.style.setProperty('--main-perspective', `${parsed * 4}${unit}`);
          cardContent.style.setProperty('--main-rear-flap-offset', `${parsed * 0.14}${unit}`);
          cardContent.style.setProperty('--main-rear-flap-spread', `${parsed * -0.05}${unit}`);
        }
      }
    }
  }

  // Called each second by the flip-clock timer to update the shown values
  getClockValue(): ClockValue {
    const serverTimeZone = this._hass?.config?.time_zone;
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const userLocals = this._hass?.locale as LocaleSettings;
    const timeZoneSetting = userLocals?.time_zone;

    const timeZone = timeZoneSetting === 'server' ? serverTimeZone : browserTimeZone;
    const date = new Date(new Date().toLocaleString("en-US", { timeZone }));

    const rawHours = date.getHours();
    const hours = this.config.twentyFourHourFormat ? rawHours : rawHours % 12 || 12;
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const period = rawHours >= 12 ? 'PM' : 'AM';

    const value: ClockValue = { hours, minutes, seconds, period, div1: ':', div2: ':' };
    return value;
  }

  // Call user configured tap action
  private handleTapAction(config: Config) {
    if (config.tap_action) {
      const actionConfig = {
        entity: config.entity,
        tap_action: config.tap_action
      };

      const event: HassEvent = new Event("hass-action", {
        bubbles: true,
        composed: true
      }) as HassEvent;

      event.detail = {
        config: actionConfig,
        action: "tap",
      };

      this.dispatchEvent(event);
    }
  }
}
