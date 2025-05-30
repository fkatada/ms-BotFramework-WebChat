import { hooks } from 'botframework-webchat-api';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, { forwardRef, memo, useCallback, useMemo, useRef } from 'react';

import SpeakActivity from '../Activity/Speak';
import useActiveDescendantId from '../providers/TranscriptFocus/useActiveDescendantId';
import useFocusByActivityKey from '../providers/TranscriptFocus/useFocusByActivityKey';
import useGetDescendantIdByActivityKey from '../providers/TranscriptFocus/useGetDescendantIdByActivityKey';
import ScreenReaderText from '../ScreenReaderText';
import { android } from '../Utils/detectBrowser';
import FocusTrap from './FocusTrap';
import useActivityAccessibleName from './useActivityAccessibleName';

import type { WebChatActivity } from 'botframework-webchat-core';
import type { MouseEventHandler, PropsWithChildren } from 'react';
import { useRefFrom } from 'use-ref-from';

const { useActivityKeysByRead, useGetHasAcknowledgedByActivityKey, useGetKeyByActivity } = hooks;

type ActivityRowProps = PropsWithChildren<{ activity: WebChatActivity }>;

const ActivityRow = forwardRef<HTMLElement, ActivityRowProps>(({ activity, children }, ref) => {
  const [activeDescendantId] = useActiveDescendantId();
  const [readActivityKeys] = useActivityKeysByRead();
  const bodyRef = useRef<HTMLDivElement>();
  const focusByActivityKey = useFocusByActivityKey();
  const getKeyByActivity = useGetKeyByActivity();
  // TODO: [P2] #2858 We should use core/definitions/speakingActivity for this predicate instead
  const shouldSpeak = activity.channelData?.speak;

  const [accessibleName] = useActivityAccessibleName(activity, bodyRef);
  const activityKey = getKeyByActivity(activity);

  const acknowledged = useGetHasAcknowledgedByActivityKey()(activityKey);
  const activityKeyRef = useRefFrom<string>(activityKey);
  const descendantId = useGetDescendantIdByActivityKey()(activityKey);
  const descendantLabelId = `webchat__basic-transcript__active-descendant-label--${activityKey}`;

  const isActiveDescendant = descendantId === activeDescendantId;
  const read = readActivityKeys.includes(activityKey);

  const focusSelf = useCallback<(withFocus?: boolean) => void>(
    (withFocus?: boolean) => focusByActivityKey(activityKeyRef.current, withFocus),
    [activityKeyRef, focusByActivityKey]
  );

  // When a child of the activity receives focus, notify the transcript to set the `aria-activedescendant` to this activity.
  const handleDescendantFocus: () => void = useCallback(() => focusSelf(false), [focusSelf]);

  // When receive Escape key from descendant, focus back to the activity.
  const handleLeaveFocusTrap = useCallback(() => focusSelf(), [focusSelf]);

  // When the user press UP/DOWN arrow keys, we put a visual focus indicator around the focused activity.
  // We should do the same for mouse, when the user click on the activity, we should also put a visual focus indicator around the activity.
  // We are doing it in event capture phase to prevent descendants from stopping event propagation to us.
  const handleMouseDownCapture: MouseEventHandler = useCallback(() => focusSelf(false), [focusSelf]);

  const focusTrapChildren = useMemo(
    () => (
      <div className="webchat__basic-transcript__activity-body" ref={bodyRef}>
        {children}
      </div>
    ),
    [bodyRef, children]
  );

  const activityIdRef = useRefFrom(activity.id);

  const handleFormData = useCallback(
    (event: FormDataEvent & { target: HTMLFormElement }) => {
      const { webchatIncludeActivityId, webchatIncludeActivityKey } = event.target.dataset;
      if (webchatIncludeActivityId) {
        event.formData.set(webchatIncludeActivityId, activityIdRef.current ?? '');
      }
      if (webchatIncludeActivityKey) {
        event.formData.set(webchatIncludeActivityKey, activityKeyRef.current);
      }
    },

    [activityKeyRef, activityIdRef]
  );

  const prevArticleRef = useRef<HTMLElement>(null);

  const wrappedRef = useCallback(
    (el: HTMLElement | null) => {
      if (prevArticleRef.current) {
        prevArticleRef.current.removeEventListener('formdata', handleFormData);
      }

      if (el) {
        el.addEventListener('formdata', handleFormData);
      }

      prevArticleRef.current = el;

      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [handleFormData, ref]
  );

  return (
    // TODO: [P2] Add `aria-roledescription="message"` for better AX, need localization strings.
    <article
      className={classNames('webchat__basic-transcript__activity', {
        'webchat__basic-transcript__activity--acknowledged': acknowledged,
        'webchat__basic-transcript__activity--read': read
      })}
      // When NVDA is in browse mode, using up/down arrow key to "browse" will dispatch "click" and "mousedown" events for <article> element (inside <LiveRegionActivity>).
      onMouseDownCapture={handleMouseDownCapture}
      ref={wrappedRef}
    >
      {/* TODO: [P1] File a crbug for TalkBack. It should not able to read the content twice when scanning. */}

      {/* The following <div> is designed for active descendant only.
          We want to prevent screen reader from scanning the content that is authored only for active descendant.
          The specific content should only read when user press UP/DOWN arrow keys to change `aria-activedescendant`.
          However, Android TalkBack 12.1 is buggy when the there is an element with ID of one of the `aria-activedescendant` potential candidates,
          TalkBack will narrate the message content twice (i.e. content of `bodyRef`), regardless whether the ID is currently set as `aria-activedescendant` or not.
          As Android does not support active descendant, we are hiding the whole DOM element altogether. */}

      {!android && (
        <div
          aria-labelledby={descendantLabelId}
          className="webchat__basic-transcript__activity-active-descendant"
          // "id" is required for "aria-labelledby"
          // eslint-disable-next-line react/forbid-dom-props
          id={descendantId}
          role="article"
        >
          <ScreenReaderText aria-hidden={true} id={descendantLabelId} text={accessibleName} />
        </div>
      )}
      <FocusTrap
        onFocus={handleDescendantFocus}
        onLeave={handleLeaveFocusTrap}
        targetClassName="webchat__basic-transcript__activity-focus-target"
      >
        {focusTrapChildren}
      </FocusTrap>
      {shouldSpeak && (
        // TODO: Should build `webChatActivitySchema`.
        <SpeakActivity activity={activity as WebChatActivity & { channelData: { speechSynthesisUtterance?: any } }} />
      )}
      <div
        className={classNames('webchat__basic-transcript__activity-indicator', {
          'webchat__basic-transcript__activity-indicator--focus': isActiveDescendant
        })}
      />
    </article>
  );
});

ActivityRow.defaultProps = {
  children: undefined
};

ActivityRow.displayName = 'ActivityRow';

ActivityRow.propTypes = {
  // PropTypes cannot fully capture TypeScript type.
  // @ts-ignore
  activity: PropTypes.shape({
    channelData: PropTypes.shape({
      speak: PropTypes.bool,
      'webchat:fallback-text': PropTypes.string
    })
  }).isRequired,
  children: PropTypes.any
};

export default memo(ActivityRow);
