@file:OptIn(org.readium.r2.shared.ExperimentalReadiumApi::class)

package com.bilal.nativeepubkit

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.PointF
import android.os.Bundle
import android.os.SystemClock
import android.text.Html
import android.util.Log
import android.view.ActionMode
import android.view.Gravity
import android.view.KeyEvent as AndroidKeyEvent
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import androidx.fragment.app.FragmentContainerView
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy
import java.util.Collections
import java.util.UUID
import java.util.WeakHashMap
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject
import org.json.JSONArray
import org.json.JSONTokener
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.preferences.ReadingProgression as ReadiumReadingProgression
import org.readium.r2.navigator.preferences.Spread as ReadiumSpread
import org.readium.r2.navigator.preferences.TextAlign as ReadiumTextAlign
import org.readium.r2.navigator.preferences.Theme as ReadiumTheme
import org.readium.r2.navigator.HyperlinkNavigator
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Selection
import org.readium.r2.navigator.input.KeyEvent as ReaderKeyEvent
import org.readium.r2.navigator.input.DragEvent as ReaderDragEvent
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.TapEvent as ReaderTapEvent
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.epub.EpubLayout
import org.readium.r2.shared.publication.presentation.presentation
import org.readium.r2.shared.publication.services.locate
import org.readium.r2.shared.publication.services.locateProgression
import org.readium.r2.shared.publication.services.positions
import org.readium.r2.shared.publication.services.rights
import org.readium.r2.shared.util.AbsoluteUrl
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser

internal fun readiumSpreadPreference(value: String): ReadiumSpread? = when (value) {
  "never" -> ReadiumSpread.NEVER
  "always" -> ReadiumSpread.ALWAYS
  // Readium Kotlin models automatic spread selection as an absent preference;
  // EpubPreferences intentionally rejects the Spread.AUTO sentinel.
  else -> null
}

private data class PreparedPublicationData(
  val generation: Long,
  val mappingDurationMilliseconds: Long,
  val positions: List<Locator>,
  val snapshot: PublicationDataSnapshot,
)

private sealed interface NativeReaderImagePayload {
  data class PublicationResource(val href: Url) : NativeReaderImagePayload
  data class InlineSVG(val data: ByteArray) : NativeReaderImagePayload
}

private data class NativeReaderImageSource(
  val contentType: String,
  val generation: Long,
  val payload: NativeReaderImagePayload,
)

class EpubReaderView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout: Boolean = true

  init {
    isFocusable = true
    isFocusableInTouchMode = true
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      if (!requestFocusFromTouch()) requestFocus()
    }
    return super.dispatchTouchEvent(event)
  }

  override fun dispatchKeyEvent(event: AndroidKeyEvent): Boolean {
    val type = when (event.action) {
      AndroidKeyEvent.ACTION_DOWN -> ReaderKeyEvent.Type.Down
      AndroidKeyEvent.ACTION_UP -> ReaderKeyEvent.Type.Up
      else -> return super.dispatchKeyEvent(event)
    }
    val readerEvent = ReaderKeyEvent(type, event)
    if (readerEvent != null && directionalInputAdapter?.onKey(readerEvent) == true) {
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    if (
      w > 0 &&
      h > 0 &&
      oldw > 0 &&
      oldh > 0 &&
      (w != oldw || h != oldh) &&
      currentReaderState == StableReaderState.READY &&
      !isProgrammaticNavigationInFlight &&
      preferenceUpdateJob == null &&
      gestureRollbackTarget == null
    ) {
      acceptedUserLocation?.let(::guardViewportResizeAt)
    }
    super.onSizeChanged(w, h, oldw, oldh)
  }

  private val onDecorationPress by EventDispatcher<Map<String, Any?>>()
  private val onFootnotePress by EventDispatcher<Map<String, Any>>()
  private val onImagePress by EventDispatcher<Map<String, Any?>>()
  private val onLinkPress by EventDispatcher<Map<String, Any>>()
  private val onLocationChange by EventDispatcher<Map<String, Any>>()
  private val onNavigationAction by EventDispatcher<Map<String, Any>>()
  private val onNavigationPolicyChange by EventDispatcher<Map<String, Any>>()
  private val onNavigationUnitBoundary by EventDispatcher<Map<String, Any>>()
  private val onPreferencesChange by EventDispatcher<Map<String, Any>>()
  private val onProgress by EventDispatcher<Map<String, Any>>()
  private val onReaderState by EventDispatcher<Map<String, Any>>()
  private val onSelectionAction by EventDispatcher<Map<String, Any>>()
  private val onSelectionChange by EventDispatcher<Map<String, Any?>>()
  private val onTypographyDiagnostics by EventDispatcher<Map<String, Any>>()
  private val hostView = FrameLayout(context)
  private val fragmentContainer = FragmentContainerView(context).apply {
    // Resource IDs occupy a different integer space than React Fabric tags.
    // View.generateViewId() can collide with a ReactTextView after remounts.
    id = R.id.native_epub_kit_fragment_container
  }
  private val statusLabel = TextView(context).apply {
    text = "Waiting for an EPUB"
    gravity = Gravity.CENTER
    setTextColor(Color.parseColor("#14213D"))
    textSize = 16f
    contentDescription = "Native EPUB Kit reader state"
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val searchCoordinator = ReaderSearchCoordinator(scope)
  private val httpClient = DefaultHttpClient()
  private val assetRetriever = AssetRetriever(context.contentResolver, httpClient)
  private val publicationOpener = PublicationOpener(
    DefaultPublicationParser(
      context.applicationContext,
      httpClient,
      assetRetriever,
      null
    )
  )
  private val sourceResolver = PublicationSourceResolver(
    AndroidContentSourceProbe(context.contentResolver)
  )
  private val sessionResources = PublicationSessionResourceLedger()
  private val generation = ReaderGeneration()
  private val eventGate = ReaderLifecycleGate()
  private val stableEventProtocol = ReaderEventProtocol()
  private val instanceId = UUID.randomUUID().toString()
  private val installedFonts = NativeFontRegistry.load(context.applicationContext)

  private var publicationSource: SharedPublicationSourceRecord? = null
  private var sourceJsonFingerprint: String? = null
  private var sourceValidationFailure: PublicationSessionFailure? = null
  private var currentReaderState = StableReaderState.IDLE
  private var openJob: Job? = null
  private var hostActivity: FragmentActivity? = null
  private var fragmentManager: FragmentManager? = null
  private var navigator: EpubNavigatorFragment? = null
  private var pendingSession: PublicationSession? = null
  private var activeSession: PublicationSession? = null
  private val activePublication: Publication?
    get() = activeSession?.publication
  private var configuredInitialLocator: Locator? = null
  private var configuredNavigationPolicy = ResolvedReaderNavigationPolicy.DEFAULTS
  private var configuredNavigationUnitBoundaryKey: String? = null
  private var configuredNavigationUnitBoundariesRequired = false
  private var configuredPreferences = ResolvedReaderPreferences.DEFAULTS
  private var configuredSelectionActions: List<ResolvedNativeSelectionAction> = emptyList()
  private var configuredTypographyProfile: ResolvedTypographyProfile? = null
  private val decorationGroups = linkedMapOf<String, List<ResolvedNativeDecoration>>()
  private val observedDecorationGroups = mutableSetOf<String>()
  private var configuredFootnotePolicy = FootnoteLinkPolicy.DEFAULT_FOOTNOTE
  private var configuredImagePolicy = ReaderImagePolicy.DEFAULT
  private var configuredLinkPolicy = FootnoteLinkPolicy.DEFAULT_LINKS
  private var pendingInitialLocator: Locator? = null
  private var pendingInitialLocatorReason: StableReaderLocationReason? = null
  private var firstLocationReason = StableReaderLocationReason.INITIAL.wireValue
  private var typographyDiagnosticJob: Job? = null
  private var selectionActionJob: Job? = null
  private var selectionActionModeHideJob: Job? = null
  private var selectionActionModeDestroyJob: Job? = null
  private var selectionCaptureJob: Job? = null
  private var footnoteEventJob: Job? = null
  private var linkNavigationJob: Job? = null
  private var imageEventJob: Job? = null
  private var linkPolicyFragmentCallbacks: FragmentManager.FragmentLifecycleCallbacks? = null
  private val guardedLinkWebViews =
    Collections.newSetFromMap(WeakHashMap<WebView, Boolean>())
  private var progressObservationJob: Job? = null
  private var publicationDataJob: Job? = null
  private var progressProbeJob: Job? = null
  private var navigationJob: Job? = null
  private var preferenceUpdateJob: Job? = null
  private var decorationRestoreJob: Job? = null
  private var navigatorReadinessTimeoutJob: Job? = null
  private var decorationUpdateInFlight = false
  private var preferenceUpdateSerial = 0L
  private var capturedSelection: Selection? = null
  private var activeSelectionActionMode: ActionMode? = null
  private var isSelectionActionModeActive = false
  private var suppressSelectionActionModeUntilSelectionEnds = false
  private var latestSelectionSnapshot: Map<String, Any>? = null
  private var latestSelectionFingerprint: String? = null
  private var latestNativeSelectionFingerprint: String? = null
  private var selectionLifecycleStarted = false
  private val diagnosedGenerations = mutableSetOf<Long>()
  private var progressProbeSignal = 0
  private var nextResourceSignal = 0
  private var progressReadyGeneration: Long? = null
  private var initialProgressGeneration: Long? = null
  private var totalPositionCount: Int? = null
  private var publicationData: PublicationDataSnapshot? = null
  private var preparedPublicationData: PreparedPublicationData? = null
  private var nativePositions: List<Locator> = emptyList()
  private var publicationDataMappingDurationMilliseconds = 0L
  private val readerReadinessGate = ReaderReadinessGate()
  private var navigationActivitySerial = 0L
  private var activeNavigationCommandId: Long? = null
  private val programmaticNavigationActivityIds = mutableSetOf<Long>()
  private var programmaticNavigationAuthorizationTarget: Locator? = null
  private var programmaticNavigationAuthorizationJob: Job? = null
  private val isProgrammaticNavigationInFlight: Boolean
    get() = programmaticNavigationActivityIds.isNotEmpty()
  private var latestStableLocation: Map<String, Any>? = null
  private var latestPreferencesStatus: Map<String, Any>? = null
  private var latestNavigationPolicyStatus: Map<String, Any>? = null
  private var navigationPolicyApplication = "initial"
  private var directionalInputAdapter: ReaderDirectionalInputAdapter? = null
  private val imageSources = linkedMapOf<String, NativeReaderImageSource>()
  private val resolvedImageFiles = linkedMapOf<String, File>()
  private var acceptedUserLocation: Locator? = null
  private var navigationUnitBoundaryConfiguration: ReaderNavigationUnitBoundaryConfiguration? = null
  private var acceptedNavigationUnitMatch: ReaderNavigationUnitBoundaryMatch? = null
  private var gestureRollbackTarget: Locator? = null
  private var gestureRollbackAllowsResourceSettlement = false
  private var viewportResizeTarget: Locator? = null
  private var viewportResizeGuardJob: Job? = null
  private var paginatedDragAnchor: Locator? = null
  private var paginatedDragCandidate: Locator? = null
  private var paginatedDragInProgress = false
  private var paginatedDragSettlementJob: Job? = null
  private var pendingNavigationUnitBoundary:
    Pair<ReaderNavigationUnitBoundaryMatch, ReaderNavigationUnitBoundaryMatch>? = null
  private var pendingUserLocationReason = StableReaderLocationReason.USER_SCROLL.wireValue
  private var isDisposed = false

  private val imageInputListener = object : InputListener {
    override fun onTap(event: ReaderTapEvent): Boolean {
      scheduleImageActivation(event.point)
      return false
    }

    override fun onDrag(event: ReaderDragEvent): Boolean {
      observePaginatedDrag(event)
      return false
    }

    override fun onKey(event: ReaderKeyEvent): Boolean = false
  }

  private val selectionActionModeCallback = object : ActionMode.Callback {
    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
      selectionActionModeDestroyJob?.cancel()
      selectionActionModeDestroyJob = null
      selectionActionModeHideJob?.cancel()
      selectionActionModeHideJob = null
      activeSelectionActionMode = mode
      isSelectionActionModeActive = true
      menu.add(Menu.NONE, android.R.id.copy, 0, android.R.string.copy)
        .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
      configuredSelectionActions.forEachIndexed { index, action ->
        menu.add(Menu.NONE, SELECTION_ACTION_ID_BASE + index, index + 1, action.title)
          .setShowAsAction(
            if (index < 2) MenuItem.SHOW_AS_ACTION_ALWAYS else MenuItem.SHOW_AS_ACTION_NEVER
          )
      }
      scheduleSelectionCapture()
      if (suppressSelectionActionModeUntilSelectionEnds) {
        keepSelectionActionModeHidden(mode)
      }
      return true
    }

    override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean = false

    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
      if (item.itemId == android.R.id.copy) {
        scheduleSystemCopy(mode)
        return true
      }
      val index = item.itemId - SELECTION_ACTION_ID_BASE
      val action = configuredSelectionActions.getOrNull(index) ?: return false
      suppressSelectionActionModeUntilSelectionEnds = true
      keepSelectionActionModeHidden(mode)
      scheduleSelectionAction(action.id)
      // Keep the selection and ActionMode alive for the consumer-owned surface,
      // while preventing Android's floating toolbar from obscuring that surface.
      return true
    }

    override fun onDestroyActionMode(mode: ActionMode) {
      // Android can replace ActionMode during a configuration change. Ignore a
      // stale destroy callback if the replacement is already active.
      if (activeSelectionActionMode !== mode) return
      selectionActionModeHideJob?.cancel()
      selectionActionModeHideJob = null
      activeSelectionActionMode = null
      isSelectionActionModeActive = false
      selectionActionModeDestroyJob?.cancel()
      selectionActionModeDestroyJob = scope.launch {
        delay(SELECTION_ACTION_MODE_RECREATION_GRACE_MILLISECONDS)
        if (activeSelectionActionMode == null && !isSelectionActionModeActive) {
          selectionActionModeDestroyJob = null
          endSelection("dismissed")
        }
      }
    }
  }

  private val decorationListener = object : DecorableNavigator.Listener {
    override fun onDecorationActivated(event: DecorableNavigator.OnActivatedEvent): Boolean {
      val currentNavigator = navigator ?: return false
      if (event.group !in observedDecorationGroups) return false
      return emitDecorationActivation(event, currentNavigator)
    }
  }

  private val hyperlinkListener = object : EpubNavigatorFragment.Listener {
    override fun shouldFollowInternalLink(
      link: Link,
      context: HyperlinkNavigator.LinkContext?,
    ): Boolean {
      val currentNavigator = navigator ?: return true
      val publication = activePublication ?: return true
      val sourceLocator = currentNavigator.currentLocator.value

      if (context is HyperlinkNavigator.FootnoteContext) {
        val decision = FootnoteLinkPolicy.decideInternal(
          configuredFootnotePolicy,
          link.href.toString(),
          semantic = true,
        )
        if (decision.decision != "emit" || decision.classification == null) return true
        emitFootnote(
          link = link,
          content = context.noteContent,
          classification = decision.classification,
          sourceLocator = sourceLocator,
          publication = publication,
        )
        return false
      }

      val footnoteDecision = FootnoteLinkPolicy.decideInternal(
        configuredFootnotePolicy,
        link.href.toString(),
        semantic = false,
      )
      if (footnoteDecision.decision == "emit" && footnoteDecision.classification != null) {
        emitFootnote(
          link = link,
          content = "",
          classification = footnoteDecision.classification,
          sourceLocator = sourceLocator,
          publication = publication,
        )
        return false
      }

      val expectedGeneration = generation.value
      val navigationActivityId = beginProgrammaticNavigationActivity()
      val targetLocator = publication.locatorFromLink(link)
      targetLocator?.let(::authorizeProgrammaticNavigation)
      linkNavigationJob?.cancel()
      linkNavigationJob = scope.launch {
        try {
          // Readium performs the actual navigation after this listener returns.
          // Preserve authorized-link ownership through its location callback so
          // the disabled chapter-gesture guard cannot roll the link back.
          delay(300)
          if (
            !generation.isCurrent(expectedGeneration) ||
            publication !== activePublication ||
            currentNavigator !== navigator
          ) {
            return@launch
          }
          val payload = mutableMapOf<String, Any>(
            "disposition" to "followed",
            "generation" to expectedGeneration,
            "href" to link.href.toString(),
            "instanceId" to instanceId,
            "kind" to "internal",
            "platform" to "android",
            "referrer" to sourceLocator.href.toString(),
            "sourceLocator" to sourceLocator.toJSON().toEventValue(),
          )
          link.mediaType?.let { payload["contentType"] = it.toString() }
          targetLocator?.let { payload["targetLocator"] = it.toJSON().toEventValue() }
          onLinkPress(payload)
        } finally {
          endProgrammaticNavigationActivity(navigationActivityId)
        }
      }
      return true
    }

    override fun onExternalLinkActivated(url: AbsoluteUrl) {
      emitExternalLinkActivation(url.toString())
    }
  }

  private fun emitExternalLinkActivation(href: String) {
    val currentNavigator = navigator ?: return
    val sourceLocator = currentNavigator.currentLocator.value
    val decision = FootnoteLinkPolicy.decideExternal(configuredLinkPolicy, href)
    val payload = mutableMapOf<String, Any>(
      "disposition" to decision.disposition,
      "generation" to generation.value,
      "href" to href,
      "instanceId" to instanceId,
      "kind" to decision.kind,
      "platform" to "android",
      "referrer" to sourceLocator.href.toString(),
      "sourceLocator" to sourceLocator.toJSON().toEventValue(),
    )
    decision.scheme?.let { payload["scheme"] = it }
    onLinkPress(payload)
  }

  private fun installLinkWebViewPolicy(
    openedNavigator: EpubNavigatorFragment,
    expectedGeneration: Long,
  ) {
    val callbacks = object : FragmentManager.FragmentLifecycleCallbacks() {
      override fun onFragmentViewCreated(
        fragmentManager: FragmentManager,
        fragment: Fragment,
        view: View,
        savedInstanceState: Bundle?,
      ) {
        installLinkWebViewPolicy(view, expectedGeneration)
      }
    }
    openedNavigator.childFragmentManager.registerFragmentLifecycleCallbacks(callbacks, true)
    linkPolicyFragmentCallbacks = callbacks
    openedNavigator.view?.let { installLinkWebViewPolicy(it, expectedGeneration) }
  }

  private fun installLinkWebViewPolicy(view: View, expectedGeneration: Long) {
    when (view) {
      is WebView -> {
        if (view.javaClass.name !in READIUM_WEB_VIEW_CLASSES || view in guardedLinkWebViews) {
          return
        }
        runCatching {
          val getter = view.javaClass.getMethod("getListener")
          val setter = view.javaClass.methods.single {
            it.name == "setListener" && it.parameterTypes.size == 1
          }
          val existing = requireNotNull(getter.invoke(view))
          val listenerType = setter.parameterTypes.single()
          val proxy = Proxy.newProxyInstance(
            listenerType.classLoader,
            arrayOf(listenerType),
          ) { _, method, arguments ->
            val request = arguments?.getOrNull(1) as? WebResourceRequest
            if (
              method.name == "shouldOverrideUrlLoading" &&
              request != null &&
              ReaderLinkWebViewPolicy.shouldIntercept(
                request.isForMainFrame,
                request.url.scheme,
              )
            ) {
              if (isCurrent(expectedGeneration)) {
                emitExternalLinkActivation(request.url.toString())
              }
              true
            } else {
              try {
                method.invoke(existing, *(arguments ?: emptyArray()))
              } catch (failure: InvocationTargetException) {
                throw failure.targetException
              }
            }
          }
          setter.invoke(view, proxy)
          guardedLinkWebViews += view
        }.getOrThrow()
      }
      is ViewGroup -> {
        for (index in 0 until view.childCount) {
          installLinkWebViewPolicy(view.getChildAt(index), expectedGeneration)
        }
      }
    }
  }

  private val activityObserver = object : DefaultLifecycleObserver {
    override fun onResume(owner: LifecycleOwner) {
      attachPendingNavigator()
    }

    override fun onDestroy(owner: LifecycleOwner) {
      if (owner === hostActivity) {
        handleHostDestroyed()
      }
    }
  }

  init {
    setBackgroundColor(Color.parseColor("#F5F0E4"))

    hostView.addView(
      fragmentContainer,
      FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    hostView.addView(
      statusLabel,
      FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
    addView(hostView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setSourceJson(value: String?) {
    val requestJson = value?.trim()?.takeIf { it.isNotEmpty() }
    if (requestJson == null) {
      if (
        sourceJsonFingerprint == null &&
        publicationSource == null &&
        sourceValidationFailure == null
      ) return
      sourceJsonFingerprint = null
      publicationSource = null
      sourceValidationFailure = null
      configuredInitialLocator = null
      configuredNavigationPolicy = ResolvedReaderNavigationPolicy.DEFAULTS
      configuredNavigationUnitBoundaryKey = null
      configuredNavigationUnitBoundariesRequired = false
      configuredPreferences = ResolvedReaderPreferences.DEFAULTS
      configuredSelectionActions = emptyList()
      configuredTypographyProfile = null
      clearDecorationState()
      pendingInitialLocator = null
      pendingInitialLocatorReason = null
      latestPreferencesStatus = null
      latestNavigationPolicyStatus = null
      navigationPolicyApplication = "initial"
      restartSession()
      return
    }

    val request = try {
      ReaderOpenRequestCodec.decode(
        requestJson,
        installedFonts.map(NativeFontDefinition::family).toSet(),
      )
    } catch (error: ReaderOpenRequestValidationException) {
      val invalidFingerprint = "invalid:$requestJson"
      if (sourceJsonFingerprint == invalidFingerprint) return
      sourceJsonFingerprint = invalidFingerprint
      publicationSource = null
      configuredInitialLocator = null
      configuredNavigationPolicy = ResolvedReaderNavigationPolicy.DEFAULTS
      configuredNavigationUnitBoundaryKey = null
      configuredNavigationUnitBoundariesRequired = false
      configuredPreferences = ResolvedReaderPreferences.DEFAULTS
      configuredSelectionActions = emptyList()
      configuredTypographyProfile = null
      clearDecorationState()
      pendingInitialLocator = null
      pendingInitialLocatorReason = null
      sourceValidationFailure = when (error.kind) {
        ReaderOpenRequestErrorKind.INVALID_LOCATOR -> PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.INVALID_LOCATOR,
          stablePhase = SharedReaderErrorPhase.NAVIGATE,
          message = "The initial locator record is invalid.",
          recoverable = true,
        )
        ReaderOpenRequestErrorKind.INVALID_NAVIGATION_POLICY -> PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.NATIVE_INVARIANT_VIOLATION,
          stablePhase = SharedReaderErrorPhase.RENDER,
          message = "The reader navigation policy record is invalid.",
          recoverable = false,
        )
        ReaderOpenRequestErrorKind.INVALID_PREFERENCES -> PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.NATIVE_INVARIANT_VIOLATION,
          stablePhase = SharedReaderErrorPhase.RENDER,
          message = "The reader preferences record is invalid.",
          recoverable = false,
        )
        ReaderOpenRequestErrorKind.INVALID_SELECTION_ACTIONS -> PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.NATIVE_INVARIANT_VIOLATION,
          stablePhase = SharedReaderErrorPhase.RENDER,
          message = "The selection action configuration is invalid.",
          recoverable = false,
        )
        ReaderOpenRequestErrorKind.INVALID_TYPOGRAPHY_PROFILE -> PublicationSessionFailure(
          stableCode = SharedReaderErrorCode.TYPOGRAPHY_CONFIGURATION_FAILED,
          stablePhase = SharedReaderErrorPhase.RENDER,
          message = "The typography profile record is invalid or references an unavailable font.",
          recoverable = true,
        )
        ReaderOpenRequestErrorKind.INVALID_SOURCE -> PublicationSourceResolver.unsupported(
          "The publication source record is invalid."
        )
      }
      restartSession()
      return
    }

    val sourceChanged = sourceJsonFingerprint != request.sourceFingerprint ||
      sourceValidationFailure != null
    val initialLocatorChanged = configuredInitialLocator != request.initialLocator
    val previousNavigationPolicy = configuredNavigationPolicy
    val navigationPolicyChanged = previousNavigationPolicy != request.navigationPolicy
    val navigationUnitBoundaryRequirementChanged =
      configuredNavigationUnitBoundariesRequired != request.navigationUnitBoundariesRequired ||
        configuredNavigationUnitBoundaryKey != request.navigationUnitBoundaryKey
    val previousPreferences = configuredPreferences
    val preferencesChanged = previousPreferences != request.preferences
    val selectionActionsChanged = configuredSelectionActions != request.selectionActions
    val typographyProfileChanged = configuredTypographyProfile != request.typographyProfile
    sourceJsonFingerprint = request.sourceFingerprint
    publicationSource = request.source
    sourceValidationFailure = null
    configuredInitialLocator = request.initialLocator
    configuredNavigationPolicy = request.navigationPolicy
    configuredNavigationUnitBoundaryKey = request.navigationUnitBoundaryKey
    configuredNavigationUnitBoundariesRequired = request.navigationUnitBoundariesRequired
    configuredPreferences = request.preferences
    configuredSelectionActions = request.selectionActions
    configuredTypographyProfile = request.typographyProfile
    if (sourceChanged) clearDecorationState()

    if (!sourceChanged) {
      if (currentReaderState == StableReaderState.READY) {
        if (typographyProfileChanged || selectionActionsChanged) {
          pendingInitialLocator = navigator?.currentLocator?.value
          pendingInitialLocatorReason = pendingInitialLocator?.let {
            StableReaderLocationReason.PREFERENCE_CHANGE
          }
          restartSession()
          return
        }
        if (navigationPolicyChanged) {
          applyNavigationPolicy(previousNavigationPolicy)
          if (
            ReaderNavigationPolicy.requiresNavigatorRecreation(
              previousNavigationPolicy,
              request.navigationPolicy,
            )
          ) return
        }
        if (preferencesChanged) applyPreferences(previousPreferences)
        if (navigationUnitBoundaryRequirementChanged) {
          navigationUnitBoundaryConfiguration = null
          acceptedNavigationUnitMatch = null
          emitNavigationPolicyStatus()
        }
        return
      }
      if (
        !initialLocatorChanged &&
        !navigationPolicyChanged &&
        !preferencesChanged &&
        !typographyProfileChanged &&
        !selectionActionsChanged &&
        !navigationUnitBoundaryRequirementChanged
      ) return
      pendingInitialLocator = request.initialLocator
      pendingInitialLocatorReason = request.initialLocator?.let {
        StableReaderLocationReason.RESTORED
      }
      restartSession()
      return
    }

    pendingInitialLocator = request.initialLocator
    pendingInitialLocatorReason = request.initialLocator?.let {
      StableReaderLocationReason.RESTORED
    }
    navigationPolicyApplication = "initial"
    restartSession()
  }

  fun setFootnotePolicyJson(value: String?) {
    configuredFootnotePolicy = runCatching { FootnoteLinkPolicy.resolveFootnote(value) }
      .getOrDefault(FootnoteLinkPolicy.DEFAULT_FOOTNOTE)
  }

  fun setLinkPolicyJson(value: String?) {
    configuredLinkPolicy = runCatching { FootnoteLinkPolicy.resolveLinks(value) }
      .getOrDefault(FootnoteLinkPolicy.DEFAULT_LINKS)
  }

  fun setImagePolicyJson(value: String?) {
    configuredImagePolicy = runCatching { ReaderImagePolicy.resolve(value) }
      .getOrDefault(ReaderImagePolicy.DEFAULT)
  }

  fun setProgressProbeSignal(value: Int?) {
    if (value == null || value == progressProbeSignal) return
    progressProbeSignal = value
    probeProgress()
  }

  fun setNextResourceSignal(value: Int?) {
    if (value == null || value == nextResourceSignal) return
    nextResourceSignal = value
    navigateToNextResource()
  }

  private fun clearDecorationState() {
    decorationRestoreJob?.cancel()
    decorationRestoreJob = null
    decorationGroups.clear()
    decorationUpdateInFlight = false
  }

  private fun restoreDecorations(
    expectedNavigator: EpubNavigatorFragment,
    expectedGeneration: Long,
  ) {
    decorationRestoreJob?.cancel()
    observedDecorationGroups.clear()
    val snapshot = decorationGroups.entries
      .sortedBy { it.key }
      .map { it.key to it.value }
    for ((group, _) in snapshot) observeDecorationInteractions(group, expectedNavigator)
    if (snapshot.isEmpty()) return
    decorationUpdateInFlight = true
    decorationRestoreJob = scope.launch {
      try {
        for ((group, records) in snapshot) {
          if (!isCurrent(expectedGeneration) || expectedNavigator !== navigator) return@launch
          expectedNavigator.applyDecorations(
            records.map(NativeDecorationRenderer::readiumDecoration),
            group,
          )
        }
      } catch (failure: Throwable) {
        if (failure !is CancellationException) {
          Log.e(LOG_TAG, "Readium decoration restoration failed", failure)
        }
      } finally {
        if (expectedNavigator === navigator) {
          decorationUpdateInFlight = false
          decorationRestoreJob = null
        }
      }
    }
  }

  private fun observeDecorationInteractions(
    group: String,
    expectedNavigator: EpubNavigatorFragment,
  ) {
    if (!observedDecorationGroups.add(group)) return
    expectedNavigator.addDecorationListener(group, decorationListener)
  }

  private fun emitDecorationActivation(
    event: DecorableNavigator.OnActivatedEvent,
    currentNavigator: EpubNavigatorFragment,
  ): Boolean {
    if (currentNavigator !== navigator) return false
    val decoration = decorationGroups[event.group]
      ?.firstOrNull { it.id == event.decoration.id }
      ?: return false
    val sequence = stableEventProtocol.nextEvent(generation.value) ?: return false
    val payload = mutableMapOf<String, Any?>(
      "decoration" to decoration.json.toNullableEventValue(),
      "generation" to generation.value,
      "group" to event.group,
      "instanceId" to instanceId,
      "platform" to "android",
      "sequence" to sequence,
    )
    decorationGeometry(event, currentNavigator)?.let { payload["geometry"] = it }
    onDecorationPress(payload)
    return true
  }

  private fun decorationGeometry(
    event: DecorableNavigator.OnActivatedEvent,
    currentNavigator: EpubNavigatorFragment,
  ): Map<String, Any>? {
    val native = event.rect?.let {
      RectValue(
        x = min(it.left, it.right).toDouble(),
        y = min(it.top, it.bottom).toDouble(),
        width = abs(it.width()).toDouble(),
        height = abs(it.height()).toDouble(),
      )
    } ?: event.point?.let {
      RectValue(x = it.x.toDouble(), y = it.y.toDouble(), width = 0.0, height = 0.0)
    } ?: return null
    return nativeGeometry(native, currentNavigator)
  }

  private fun configureImageInputListener() {
    val currentNavigator = navigator ?: return
    currentNavigator.removeInputListener(imageInputListener)
    if (activePublication?.metadata?.presentation?.layout == EpubLayout.FIXED) return
    currentNavigator.addInputListener(imageInputListener)
  }

  private fun scheduleImageActivation(point: PointF) {
    val currentNavigator = navigator ?: return
    if (currentReaderState != StableReaderState.READY) return
    if (activePublication?.metadata?.presentation?.layout == EpubLayout.FIXED) return
    val expectedGeneration = generation.value
    val x = point.x
    val y = point.y
    imageEventJob?.cancel()
    imageEventJob = scope.launch {
      val raw = runCatching {
        currentNavigator.evaluateJavascript(imageActivationScript(x, y))
      }.getOrNull() ?: return@launch
      val result = parseDiagnosticJson(raw) ?: return@launch
      if (!isCurrent(expectedGeneration) || currentNavigator !== navigator) return@launch

      val currentLocator = currentNavigator.currentLocator.value
      val selector = result.trimmedImageString("selector")
      val locator = if (selector == null) {
        currentLocator
      } else {
        currentLocator.copyWithLocations(
          otherLocations = currentLocator.locations.otherLocations + ("cssSelector" to selector),
        )
      }
      val source = imageSourceValue(result, locator)
      val sequence = stableEventProtocol.nextEvent(expectedGeneration) ?: return@launch
      val payload = mutableMapOf<String, Any?>(
        "generation" to expectedGeneration,
        "instanceId" to instanceId,
        "locator" to locator.toJSON().toEventValue(),
        "platform" to "android",
        "rights" to mapOf(
          "canShare" to configuredImagePolicy.allowSharing,
          "canZoom" to configuredImagePolicy.allowZoom,
        ),
        "sequence" to sequence,
        "source" to source,
      )
      result.trimmedImageString("alt")?.let { payload["alt"] = boundedImageText(it) }
      result.trimmedImageString("caption")?.let { payload["caption"] = boundedImageText(it) }
      val rect = result.optJSONObject("rect")?.let {
        val values = listOf(it.optDouble("x"), it.optDouble("y"), it.optDouble("width"), it.optDouble("height"))
        if (values.all(Double::isFinite) && values[2] >= 0 && values[3] >= 0) {
          RectValue(values[0], values[1], values[2], values[3])
        } else {
          null
        }
      }
      rect?.let { nativeGeometry(it, currentNavigator) }?.let { payload["geometry"] = it }
      val valid = runCatching {
        SharedCoreRecordCodec.decode(
          SharedCoreRecordType.READER_IMAGE_ACTIVATION_EVENT,
          JSONObject(payload),
        )
      }.isSuccess
      if (!valid) return@launch
      onImagePress(payload)
      imageEventJob = null
    }
  }

  private fun imageActivationScript(x: Float, y: Float): String = """
    (() => {
      const dpr = window.devicePixelRatio || 1;
      const target = document.elementFromPoint(${x.toDouble()} / dpr, ${y.toDouble()} / dpr);
      const element = target && target.closest ? target.closest('img,svg') : null;
      if (!element) return null;
      const trimmed = (value) => {
        const result = typeof value === 'string' ? value.trim() : '';
        return result || null;
      };
      const selectorFor = (node) => {
        if (node.id && document.getElementById(node.id) === node) {
          const escaped = globalThis.CSS && CSS.escape
            ? CSS.escape(node.id)
            : node.id.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
          return '#' + escaped;
        }
        const parts = [];
        while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
          const tag = node.tagName.toLowerCase();
          let index = 1;
          let sibling = node.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === node.tagName) index += 1;
            sibling = sibling.previousElementSibling;
          }
          parts.unshift(tag + ':nth-of-type(' + index + ')');
          node = node.parentElement;
        }
        return parts.join(' > ');
      };
      const figure = element.closest('figure');
      const figureCaption = figure ? figure.querySelector('figcaption') : null;
      const title = element.querySelector(':scope > title');
      const description = element.querySelector(':scope > desc');
      const rect = element.getBoundingClientRect();
      return JSON.stringify({
        tag: element.tagName.toLowerCase(),
        src: trimmed(element.getAttribute('src')) || trimmed(element.getAttribute('href')),
        inlineSvg: element.tagName.toLowerCase() === 'svg' ? element.outerHTML : null,
        alt: trimmed(element.getAttribute('alt')) || trimmed(element.getAttribute('aria-label')),
        caption: trimmed(figureCaption && figureCaption.textContent)
          || trimmed(element.getAttribute('title'))
          || trimmed(title && title.textContent)
          || trimmed(description && description.textContent),
        selector: selectorFor(element),
        rect: {
          x: rect.left * dpr,
          y: rect.top * dpr,
          width: rect.width * dpr,
          height: rect.height * dpr,
        },
      });
    })()
  """.trimIndent()

  private fun imageSourceValue(result: JSONObject, locator: Locator): Map<String, Any?> {
    val rawSource = result.trimmedImageString("src")
    if (rawSource == null && result.optString("tag") == "svg") {
      val data = result.trimmedImageString("inlineSvg")?.toByteArray(Charsets.UTF_8)
      if (data == null) {
        return mapOf(
          "kind" to "inline-svg",
          "resolvable" to false,
          "unresolvedReason" to "unsupported-source",
        )
      }
      if (data.size > MAXIMUM_RESOLVED_IMAGE_BYTES) {
        return mapOf(
          "contentType" to "image/svg+xml",
          "kind" to "inline-svg",
          "resolvable" to false,
          "unresolvedReason" to "source-too-large",
        )
      }
      val handle = registerImageSource("image/svg+xml", NativeReaderImagePayload.InlineSVG(data))
        ?: return mapOf(
          "contentType" to "image/svg+xml",
          "kind" to "inline-svg",
          "resolvable" to false,
          "unresolvedReason" to "unsupported-source",
        )
      return mapOf(
        "contentType" to "image/svg+xml",
        "handle" to handle,
        "kind" to "inline-svg",
        "resolvable" to true,
      )
    }
    if (rawSource == null) {
      return mapOf(
        "kind" to "inline-svg",
        "resolvable" to false,
        "unresolvedReason" to "unsupported-source",
      )
    }
    val parsed = Url(rawSource)
    val resolved = parsed?.let(locator.href::resolve)
    val href = boundedImageText(resolved?.toString() ?: rawSource.orEmpty(), 4_096)
    val contentType = imageContentType(
      activePublication?.linkWithHref(resolved ?: locator.href)?.mediaType?.toString(),
      href,
    )
    if (resolved is AbsoluteUrl) {
      return mapOf(
        "contentType" to contentType,
        "href" to href,
        "kind" to "external",
        "resolvable" to false,
        "unresolvedReason" to "external-resource",
      )
    }
    if (resolved == null) {
      return mapOf(
        "contentType" to contentType,
        "href" to href,
        "kind" to "publication-resource",
        "resolvable" to false,
        "unresolvedReason" to "resource-not-found",
      )
    }
    val resource = activePublication?.get(resolved)
    if (resource == null) {
      return mapOf(
        "contentType" to contentType,
        "href" to href,
        "kind" to "publication-resource",
        "resolvable" to false,
        "unresolvedReason" to "resource-not-found",
      )
    }
    resource.close()
    val handle = registerImageSource(
      contentType,
      NativeReaderImagePayload.PublicationResource(resolved),
    ) ?: return mapOf(
      "contentType" to contentType,
      "href" to href,
      "kind" to "publication-resource",
      "resolvable" to false,
      "unresolvedReason" to "unsupported-source",
    )
    return mapOf(
      "contentType" to contentType,
      "handle" to handle,
      "href" to href,
      "kind" to "publication-resource",
      "resolvable" to true,
    )
  }

  private fun registerImageSource(
    contentType: String,
    payload: NativeReaderImagePayload,
  ): String? {
    if (imageSources.size >= MAXIMUM_IMAGE_SOURCE_HANDLES) return null
    val handle = UUID.randomUUID().toString()
    imageSources[handle] = NativeReaderImageSource(contentType, generation.value, payload)
    return handle
  }

  private fun JSONObject.trimmedImageString(key: String): String? =
    (opt(key) as? String)?.trim()?.takeIf(String::isNotEmpty)

  private fun boundedImageText(value: String, maximumUTF16Units: Int = 4_096): String =
    value.trim().take(maximumUTF16Units)

  private fun imageContentType(declared: String?, href: String): String {
    declared?.lowercase()?.takeIf { it.startsWith("image/") && it.length <= 128 }?.let {
      return it
    }
    return when (href.substringBefore('?').substringAfterLast('.').lowercase()) {
      "gif" -> "image/gif"
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "svg" -> "image/svg+xml"
      "webp" -> "image/webp"
      else -> "image/octet-stream"
    }
  }

  private fun clearImageResources() {
    imageSources.clear()
    resolvedImageFiles.values.forEach(File::delete)
    resolvedImageFiles.clear()
    imageResourceDirectory.deleteRecursively()
  }

  private val imageResourceDirectory: File
    get() = File(context.cacheDir, "native-epub-kit-images-$instanceId")

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (isDisposed) return

    bindHostActivity()
    startCurrentSource()
  }

  override fun onDetachedFromWindow() {
    stopForUnmount()
    unbindHostActivity()
    super.onDetachedFromWindow()
  }

  fun dispose() {
    if (isDisposed) return
    isDisposed = true

    endSelection("dismissed")
    generation.advance()
    clearSession(removeFragment = true)
    clearDecorationState()
    unbindHostActivity()
    scope.cancel()
  }

  private fun restartSession() {
    endSelection("dismissed")
    val cancelledGeneration = generation.advance()
    emitClosingIfNeeded(cancelledGeneration)
    clearSession(removeFragment = true)

    if (!isAttachedToWindow) {
      emitState("unmounted")
      return
    }
    startCurrentSource()
  }

  private fun startCurrentSource() {
    if (isDisposed || !isAttachedToWindow) return

    sourceValidationFailure?.let { failure ->
      val currentGeneration = generation.advance()
      showStatus("Opening EPUB…")
      emitState("opening", suppliedGeneration = currentGeneration)
      finishWithError(failure, currentGeneration)
      return
    }
    val source = publicationSource ?: run {
      showStatus("Waiting for an EPUB")
      emitState("idle")
      return
    }
    val currentGeneration = generation.advance()
    readerReadinessGate.begin(currentGeneration)
    preparedPublicationData = null
    val profile = configuredTypographyProfile
    val requestedInitialLocator = pendingInitialLocator
    val requestedInitialLocatorReason = pendingInitialLocatorReason
    showStatus("Opening EPUB…")
    emitState("opening", suppliedGeneration = currentGeneration)

    val session = PublicationSession(
      assetRetriever = assetRetriever,
      publicationOpener = publicationOpener,
      sourceResolver = sourceResolver,
      resourceLedger = sessionResources,
    )
    pendingSession = session
    openJob = scope.launch {
      try {
        session.open(
          source = source,
          typographyProfile = profile,
        )
        if (!isCurrent(currentGeneration) || pendingSession !== session) {
          session.close()
          return@launch
        }
        if (requestedInitialLocator != null) {
          val resolvedInitialLocator = session.publication?.locate(requestedInitialLocator)
          if (resolvedInitialLocator == null) {
            session.close()
            if (pendingSession === session) pendingSession = null
            finishWithError(
              code = "INVALID_LOCATOR",
              phase = "navigate",
              message = "The initial locator does not resolve in this publication.",
              recoverable = true,
              generation = currentGeneration,
            )
            return@launch
          }
          pendingInitialLocator = resolvedInitialLocator
        }
        if (!isCurrent(currentGeneration) || pendingSession !== session) {
          session.close()
          return@launch
        }
        firstLocationReason = NavigationPolicy.initialLocationReason(
          hasLocator = requestedInitialLocator != null,
          preferenceChange = requestedInitialLocatorReason ==
            StableReaderLocationReason.PREFERENCE_CHANGE,
        ).wireValue
        attachPendingNavigator(currentGeneration)
      } catch (_: CancellationException) {
        // A newer generation owns the next visible state. PublicationSession
        // has already closed every transient resource.
      } catch (failure: PublicationSessionFailure) {
        if (pendingSession === session) pendingSession = null
        finishWithError(failure, currentGeneration)
      } catch (_: Throwable) {
        if (pendingSession === session) {
          session.close()
          pendingSession = null
        }
        finishWithError(
          code = "PUBLICATION_OPEN_FAILED",
          phase = "open",
          message = "The EPUB publication could not be opened.",
          recoverable = true,
          generation = currentGeneration
        )
      }
    }
  }

  private fun bindHostActivity(): FragmentActivity? {
    val activity = appContext.currentActivity as? FragmentActivity
    if (activity === hostActivity) return activity

    unbindHostActivity()
    hostActivity = activity
    fragmentManager = activity?.supportFragmentManager
    activity?.lifecycle?.addObserver(activityObserver)
    return activity
  }

  private fun unbindHostActivity() {
    hostActivity?.lifecycle?.removeObserver(activityObserver)
    hostActivity = null
    fragmentManager = null
  }

  private fun attachPendingNavigator(expectedGeneration: Long = generation.value) {
    if (!isCurrent(expectedGeneration)) return
    val session = pendingSession ?: return
    val publication = session.publication ?: return
    val activity = bindHostActivity() ?: run {
      showStatus("Waiting for FragmentActivity host…")
      emitState("waitingForHost", suppliedGeneration = expectedGeneration)
      return
    }
    val manager = fragmentManager ?: return

    if (
      manager.isDestroyed ||
      manager.isStateSaved ||
      !activity.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
    ) {
      showStatus("Waiting for native host…")
      emitState("waitingForHost", suppliedGeneration = expectedGeneration)
      return
    }

    val openedNavigator = try {
      val configuration = EpubNavigatorFragment.Configuration()
      configuration.decorationTemplates = NativeDecorationRenderer.templates()
      configuration.selectionActionModeCallback = selectionActionModeCallback
      configuration.disableSelectionWhenProtected = true
      // Let Readium surface the candidate at a resource boundary. Its native
      // scroll-boundary switch can wrap a paginated resource back to its first
      // page on Android, which loses the accepted reading point. The
      // generation-scoped locator guard below rejects and restores disallowed
      // chapter/unit crossings without interfering with same-resource pages.
      configuration.disablePageTurnsWhileScrolling = false
      if (
        publication.metadata.presentation.layout != EpubLayout.FIXED &&
        configuredTypographyProfile?.publisherStyles?.injectsProfileRules == true
      ) {
        NativeFontRegistry.configure(configuration, installedFonts)
      }
      val fragmentFactory = EpubNavigatorFactory(publication).createFragmentFactory(
        initialLocator = pendingInitialLocator,
        initialPreferences = readiumPreferences(
          configuredPreferences,
          fixedLayout = publication.metadata.presentation.layout == EpubLayout.FIXED,
          typographyProfile = configuredTypographyProfile,
        ),
        listener = hyperlinkListener,
        paginationListener = object : EpubNavigatorFragment.PaginationListener {
          override fun onPageLoaded() {
            markNavigatorViewportReady(expectedGeneration)
          }
        },
        configuration = configuration
      )
      fragmentFactory.instantiate(
        context.classLoader,
        EpubNavigatorFragment::class.java.name
      ) as EpubNavigatorFragment
    } catch (failure: Throwable) {
      Log.e(LOG_TAG, "Readium EPUB navigator creation failed", failure)
      pendingSession = null
      session.close()
      finishWithError(
        code = "NAVIGATOR_CREATION_FAILED",
        phase = "render",
        message = "The EPUB navigator could not be created.",
        recoverable = true,
        generation = expectedGeneration
      )
      return
    }

    try {
      manager.beginTransaction()
        .setReorderingAllowed(true)
        .add(
          fragmentContainer.id,
          openedNavigator,
          NavigatorHostIdentity.fragmentTag(
            instanceId,
            fragmentContainer.id,
            expectedGeneration,
          )
        )
        .commitNow()

      if (!isCurrent(expectedGeneration)) {
        manager.beginTransaction().remove(openedNavigator).commitNowAllowingStateLoss()
        session.close()
        pendingSession = null
        return
      }

      navigator = openedNavigator
      restoreDecorations(openedNavigator, expectedGeneration)
      installLinkWebViewPolicy(openedNavigator, expectedGeneration)
      pendingInitialLocator = null
      pendingInitialLocatorReason = null
      activeSession = session
      pendingSession = null
      openJob = null
      showStatus("Preparing publication data…")
      scheduleNavigatorReadinessTimeout(expectedGeneration)
      preparePublicationData(publication, openedNavigator, expectedGeneration)
    } catch (_: Throwable) {
      if (openedNavigator.isAdded && !manager.isDestroyed) {
        manager.beginTransaction().remove(openedNavigator).commitNowAllowingStateLoss()
      }
      navigator = null
      activeSession = null
      pendingSession = null
      session.close()
      finishWithError(
        code = "NATIVE_INVARIANT_VIOLATION",
        phase = "render",
        message = "The native EPUB host could not attach the navigator.",
        recoverable = false,
        generation = expectedGeneration
      )
    }
  }

  private fun stopForUnmount() {
    if (isDisposed) return

    navigator?.currentLocator?.value?.let {
      pendingInitialLocator = it
      pendingInitialLocatorReason = StableReaderLocationReason.RESTORED
    }
    endSelection("dismissed")
    val cancelledGeneration = generation.advance()
    emitClosingIfNeeded(cancelledGeneration)
    clearSession(removeFragment = true)
    showStatus("Reader unmounted")
    emitState("unmounted")
  }

  private fun handleHostDestroyed() {
    navigator?.currentLocator?.value?.let {
      pendingInitialLocator = it
      pendingInitialLocatorReason = StableReaderLocationReason.RESTORED
    }
    endSelection("dismissed")
    val cancelledGeneration = generation.advance()
    emitClosingIfNeeded(cancelledGeneration)
    clearSession(removeFragment = false)
    unbindHostActivity()
  }

  private fun clearSession(removeFragment: Boolean) {
    searchCoordinator.cancelAll()
    openJob?.cancel()
    openJob = null
    typographyDiagnosticJob?.cancel()
    typographyDiagnosticJob = null
    selectionActionJob?.cancel()
    selectionActionJob = null
    selectionActionModeHideJob?.cancel()
    selectionActionModeHideJob = null
    selectionActionModeDestroyJob?.cancel()
    selectionActionModeDestroyJob = null
    selectionCaptureJob?.cancel()
    selectionCaptureJob = null
    footnoteEventJob?.cancel()
    footnoteEventJob = null
    linkNavigationJob?.cancel()
    linkNavigationJob = null
    imageEventJob?.cancel()
    imageEventJob = null
    progressObservationJob?.cancel()
    progressObservationJob = null
    publicationDataJob?.cancel()
    publicationDataJob = null
    progressProbeJob?.cancel()
    progressProbeJob = null
    navigationJob?.cancel()
    navigationJob = null
    preferenceUpdateJob?.cancel()
    preferenceUpdateJob = null
    decorationRestoreJob?.cancel()
    decorationRestoreJob = null
    navigatorReadinessTimeoutJob?.cancel()
    navigatorReadinessTimeoutJob = null
    decorationUpdateInFlight = false
    preferenceUpdateSerial += 1
    progressReadyGeneration = null
    initialProgressGeneration = null
    firstLocationReason = StableReaderLocationReason.INITIAL.wireValue
    totalPositionCount = null
    publicationData = null
    preparedPublicationData = null
    nativePositions = emptyList()
    publicationDataMappingDurationMilliseconds = 0L
    readerReadinessGate.reset()
    activeNavigationCommandId = null
    programmaticNavigationActivityIds.clear()
    clearProgrammaticNavigationAuthorization()
    clearViewportResizeGuard()
    latestStableLocation = null
    latestPreferencesStatus = null
    latestNavigationPolicyStatus = null
    acceptedUserLocation = null
    navigationUnitBoundaryConfiguration = null
    acceptedNavigationUnitMatch = null
    gestureRollbackTarget = null
    gestureRollbackAllowsResourceSettlement = false
    clearPaginatedDrag()
    pendingNavigationUnitBoundary = null
    pendingUserLocationReason = StableReaderLocationReason.USER_SCROLL.wireValue
    capturedSelection = null
    activeSelectionActionMode = null
    isSelectionActionModeActive = false
    suppressSelectionActionModeUntilSelectionEnds = false
    latestSelectionSnapshot = null
    latestSelectionFingerprint = null
    latestNativeSelectionFingerprint = null
    selectionLifecycleStarted = false

    val currentNavigator = navigator
    if (currentNavigator != null) {
      currentNavigator.removeInputListener(imageInputListener)
      directionalInputAdapter?.let { currentNavigator.removeInputListener(it) }
      currentNavigator.removeDecorationListener(decorationListener)
      linkPolicyFragmentCallbacks?.let {
        currentNavigator.childFragmentManager.unregisterFragmentLifecycleCallbacks(it)
      }
    }
    linkPolicyFragmentCallbacks = null
    observedDecorationGroups.clear()
    directionalInputAdapter = null
    clearImageResources()
    val manager = fragmentManager
    if (
      removeFragment &&
      currentNavigator != null &&
      manager != null &&
      currentNavigator.isAdded &&
      !manager.isDestroyed
    ) {
      val transaction = manager.beginTransaction().remove(currentNavigator)
      if (manager.isStateSaved) {
        transaction.commitNowAllowingStateLoss()
      } else {
        transaction.commitNow()
      }
    }

    navigator = null
    activeSession?.close()
    activeSession = null
    pendingSession?.close()
    pendingSession = null
  }

  private fun finishWithError(error: PublicationSessionFailure, generation: Long) {
    finishWithError(
      code = error.code,
      phase = error.phase,
      message = error.message,
      recoverable = error.recoverable,
      generation = generation
    )
  }

  private fun finishWithError(
    code: String,
    phase: String,
    message: String,
    recoverable: Boolean,
    generation: Long,
  ) {
    if (!isCurrent(generation)) return

    val stableCode = SharedReaderErrorMapper.code(code).wireValue
    val stablePhase = SharedReaderErrorMapper.phase(phase).wireValue

    openJob = null
    pendingSession?.close()
    pendingSession = null
    showStatus("Unable to open EPUB\n$message")
    emitState(
      state = "error",
      code = stableCode,
      phase = stablePhase,
      message = message,
      recoverable = recoverable,
      suppliedGeneration = generation
    )
  }

  private fun emitClosingIfNeeded(suppliedGeneration: Long) {
    if (
      openJob?.isActive == true ||
      navigator != null ||
      activeSession != null ||
      pendingSession != null
    ) {
      emitState("closing", suppliedGeneration = suppliedGeneration)
    }
  }

  private fun showStatus(message: String) {
    statusLabel.text = message
    statusLabel.visibility = View.VISIBLE
  }

  private fun scheduleTypographyDiagnostics(expectedGeneration: Long) {
    if (expectedGeneration in diagnosedGenerations) return
    if (typographyDiagnosticJob?.isActive == true) return
    typographyDiagnosticJob = scope.launch {
      repeat(12) { attempt ->
        if (attempt > 0) delay(200)
        if (!isCurrent(expectedGeneration)) return@launch
        val currentNavigator = navigator ?: return@repeat
        val locatorBefore = currentNavigator.currentLocator.value
        val raw = runCatching {
          currentNavigator.evaluateJavascript(TYPOGRAPHY_DIAGNOSTIC_SCRIPT)
        }.getOrNull() ?: return@repeat
        val result = parseDiagnosticJson(raw) ?: return@repeat
        val fontLoaded = result.optBoolean("fontLoaded", false)
        if (
          configuredTypographyProfile?.publisherStyles?.injectsProfileRules == true &&
          !fontLoaded &&
          attempt < 11
        ) {
          return@repeat
        }

        val locatorAfter = currentNavigator.currentLocator.value
        val payload = mutableMapOf<String, Any>(
          "platform" to "android",
          "generation" to expectedGeneration,
          "instanceId" to instanceId,
          "mode" to (
            configuredTypographyProfile?.publisherStyles?.wireValue ?: "preserve"
          ),
          "configuredFontFamily" to (installedFonts.firstOrNull()?.family ?: ""),
          "locatorHref" to locatorAfter.href.toString(),
          "locatorStableDuringProbe" to (locatorBefore == locatorAfter),
          "markerMode" to result.optString("markerMode"),
          "configuredFamily" to result.optString("configuredFamily"),
          "fontLoaded" to fontLoaded,
          "regularFaceLoaded" to result.optBoolean("regularFaceLoaded", false),
          "boldFaceLoaded" to result.optBoolean("boldFaceLoaded", false),
          "fontsStatus" to result.optString("fontsStatus"),
          "rootBackgroundColor" to result.optString("rootBackgroundColor"),
          "bodyBackgroundColor" to result.optString("bodyBackgroundColor"),
          "bodyColor" to result.optString("bodyColor"),
          "bodyFontFamily" to result.optString("bodyFontFamily"),
          "bodyDirection" to result.optString("bodyDirection"),
          "englishFontFamily" to result.optString("englishFontFamily"),
          "englishDirection" to result.optString("englishDirection"),
          "arabicFontFamily" to result.optString("arabicFontFamily"),
          "arabicDirection" to result.optString("arabicDirection"),
          "urduFontFamily" to result.optString("urduFontFamily"),
          "urduDirection" to result.optString("urduDirection"),
          "quranicFontFamily" to result.optString("quranicFontFamily"),
          "quranicDirection" to result.optString("quranicDirection"),
          "quranicColor" to result.optString("quranicColor"),
          "linkColor" to result.optString("linkColor"),
          "rangeFinite" to result.optBoolean("rangeFinite", false),
          "selectionApiAvailable" to result.optBoolean("selectionApiAvailable", false),
        )
        diagnosedGenerations += expectedGeneration
        onTypographyDiagnostics(payload)
        typographyDiagnosticJob = null
        return@launch
      }
      typographyDiagnosticJob = null
    }
  }

  private fun emitFootnote(
    link: Link,
    content: String,
    classification: String,
    sourceLocator: Locator,
    publication: Publication,
  ) {
    val expectedGeneration = generation.value
    val sourcePayload = sourceLocator.toJSON().toEventValue()
    footnoteEventJob?.cancel()
    footnoteEventJob = scope.launch {
      val normalizedContent = if (content.isEmpty()) {
        resolvedFootnoteContent(link, publication)
      } else {
        content
      }
      if (!isCurrent(expectedGeneration) || publication !== activePublication) return@launch
      val boundedHtml = SelectionTextBounder.bound(
        normalizedContent,
        MAXIMUM_FOOTNOTE_HTML_UTF16_UNITS,
      )
      val plainText = Html.fromHtml(normalizedContent, Html.FROM_HTML_MODE_LEGACY)
        .toString()
        .replace(Regex("\\s+"), " ")
        .trim()
      val boundedText = SelectionTextBounder.bound(plainText, MAXIMUM_FOOTNOTE_TEXT_UTF16_UNITS)
      val payload = mutableMapOf<String, Any>(
        "classification" to classification,
        "generation" to expectedGeneration,
        "href" to link.href.toString(),
        "instanceId" to instanceId,
        "platform" to "android",
        "referrer" to sourceLocator.href.toString(),
        "sourceLocator" to sourcePayload,
        "text" to boundedText.text,
        "truncated" to (boundedHtml.truncated || boundedText.truncated),
      )
      if (boundedHtml.text.isNotEmpty()) payload["html"] = boundedHtml.text
      link.href.toString().substringAfter('#', "").takeIf { it.isNotEmpty() }?.let {
        payload["id"] = it
      }
      link.mediaType?.let { payload["contentType"] = it.toString() }
      firstHtmlAttribute("(?:xml:lang|lang)", normalizedContent)?.let {
        payload["language"] = it
      }
      firstHtmlAttribute("dir", normalizedContent)?.lowercase()?.takeIf {
        it in setOf("ltr", "rtl", "auto")
      }?.let { payload["direction"] = it }
      publication.locatorFromLink(link)?.let {
        payload["targetLocator"] = it.toJSON().toEventValue()
      }
      onFootnotePress(payload)
      footnoteEventJob = null
    }
  }

  private fun firstHtmlAttribute(name: String, html: String): String? {
    if (html.isEmpty()) return null
    val match = Regex("\\b$name\\s*=\\s*(['\"])([^'\"]+)\\1", RegexOption.IGNORE_CASE)
      .find(html) ?: return null
    return match.groupValues[2].trim().takeIf { it.isNotEmpty() }
  }

  private suspend fun resolvedFootnoteContent(link: Link, publication: Publication): String {
    val href = link.href.toString()
    val fragment = href.substringAfter('#', "")
    if (fragment.isEmpty()) return ""
    val resource = publication.get(link) ?: return ""
    val data = try {
      resource.read(0L until MAXIMUM_FOOTNOTE_RESOURCE_BYTES).getOrNull()
    } finally {
      resource.close()
    } ?: return ""
    val document = data.toString(Charsets.UTF_8)
    return FootnoteLinkPolicy.targetHtml(document, fragment)
  }

  private fun startProgressObservation(
    publication: Publication,
    navigator: EpubNavigatorFragment,
    expectedGeneration: Long,
  ) {
    progressObservationJob?.cancel()
    progressObservationJob = scope.launch {
      if (
        !isCurrent(expectedGeneration) ||
        publication !== activePublication ||
        navigator !== this@EpubReaderView.navigator
      ) {
        return@launch
      }

      progressReadyGeneration = expectedGeneration
      navigator.currentLocator.collect { locator ->
        if (
          !isCurrent(expectedGeneration) ||
          publication !== activePublication ||
          navigator !== this@EpubReaderView.navigator
        ) {
          return@collect
        }
        if (preferenceUpdateJob != null) return@collect
        if (handleUserLocationCandidate(locator, navigator)) return@collect
        val reason = if (initialProgressGeneration == expectedGeneration) {
          if (isProgrammaticNavigationInFlight) "programmatic" else pendingUserLocationReason
        } else {
          firstLocationReason
        }
        emitProgress(locator, reason)
      }
    }
  }

  private fun handleUserLocationCandidate(
    locator: Locator,
    currentNavigator: EpubNavigatorFragment,
  ): Boolean {
    viewportResizeTarget?.let { target ->
      if (locatorMatchesTarget(locator, target)) {
        acceptedUserLocation = locator
        updateAcceptedNavigationUnitMatch(locator)
        clearViewportResizeGuard()
        return true
      }
      clearViewportResizeGuard()
      gestureRollbackTarget = target
      gestureRollbackAllowsResourceSettlement = true
      if (!currentNavigator.go(target, false)) {
        gestureRollbackTarget = null
        gestureRollbackAllowsResourceSettlement = false
        acceptedUserLocation = locator
        updateAcceptedNavigationUnitMatch(locator)
        return false
      }
      return true
    }
    gestureRollbackTarget?.let { target ->
      if (
        locatorMatchesTarget(locator, target) ||
        (gestureRollbackAllowsResourceSettlement && resourcePathsMatch(locator, target))
      ) {
        acceptedUserLocation = locator
        gestureRollbackTarget = null
        gestureRollbackAllowsResourceSettlement = false
        pendingNavigationUnitBoundary?.let { (current, candidate) ->
          acceptedNavigationUnitMatch = current
          emitNavigationUnitBoundary(current, candidate, locator)
        }
        pendingNavigationUnitBoundary = null
      }
      return true
    }
    paginatedDragAnchor?.let {
      paginatedDragCandidate = locator
      if (!paginatedDragInProgress) schedulePaginatedDragSettlement()
      return true
    }
    if (progressReadyGeneration != generation.value) {
      acceptedUserLocation = locator
      updateAcceptedNavigationUnitMatch(locator)
      return false
    }
    if (
      isProgrammaticNavigationInFlight ||
      isProgrammaticNavigationAuthorized(locator) ||
      preferenceUpdateJob != null
    ) {
      acceptedUserLocation = locator
      updateAcceptedNavigationUnitMatch(locator)
      return false
    }
    val previous = acceptedUserLocation ?: run {
      acceptedUserLocation = locator
      updateAcceptedNavigationUnitMatch(locator)
      return false
    }
    val resourceChanged = !resourcePathsMatch(previous, locator)
    val configuration = navigationUnitBoundaryConfiguration
    val previousUnitMatch = configuration?.let {
      NavigationUnitBoundaryPolicy.match(
        it,
        previous.toNavigationBoundaryLocation(),
        acceptedNavigationUnitMatch?.unit?.id,
      )
    }
    val candidateUnitMatch = configuration?.let {
      NavigationUnitBoundaryPolicy.match(
        it,
        locator.toNavigationBoundaryLocation(),
        previousUnitMatch?.unit?.id,
      )
    }
    val exactUnitChanged =
      previousUnitMatch != null &&
        candidateUnitMatch != null &&
        previousUnitMatch.unit.id != candidateUnitMatch.unit.id
    val boundariesPending =
      configuredNavigationUnitBoundariesRequired &&
        configuration == null &&
        effectiveReaderLayout() == "paginated"
    val rejected = ReaderNavigationPolicy.rejectsUserMovement(
      configuredNavigationPolicy,
      effectiveReaderLayout(),
      exactUnitChanged || resourceChanged || boundariesPending,
    )
    if (!rejected) {
      acceptedUserLocation = locator
      acceptedNavigationUnitMatch = candidateUnitMatch
      pendingUserLocationReason =
        if (effectiveReaderLayout() == "paginated" || resourceChanged) {
          StableReaderLocationReason.USER_PAGE_TURN.wireValue
        } else {
          StableReaderLocationReason.USER_SCROLL.wireValue
        }
      return false
    }

    // Readium position locators are often resource-granular. During a rejected
    // boundary turn they can outrank the more precise intra-resource
    // progression and send the navigator to page one. Strip publication-level
    // hints so rollback resolves the exact accepted viewport.
    val rollbackTarget = viewportStableLocator(previous)
    gestureRollbackTarget = rollbackTarget
    gestureRollbackAllowsResourceSettlement = false
    pendingNavigationUnitBoundary = if (exactUnitChanged) {
      previousUnitMatch!! to candidateUnitMatch!!
    } else {
      null
    }
    if (!currentNavigator.go(rollbackTarget, false)) {
      gestureRollbackTarget = null
      gestureRollbackAllowsResourceSettlement = false
      pendingNavigationUnitBoundary = null
      acceptedUserLocation = locator
      acceptedNavigationUnitMatch = candidateUnitMatch
      pendingUserLocationReason = StableReaderLocationReason.USER_PAGE_TURN.wireValue
      return false
    }
    return true
  }

  private fun emitNavigationUnitBoundary(
    current: ReaderNavigationUnitBoundaryMatch,
    candidate: ReaderNavigationUnitBoundaryMatch,
    locator: Locator,
  ) {
    val configuration = navigationUnitBoundaryConfiguration ?: return
    if (
      configuration.generation != generation.value ||
      configuration.instanceId != instanceId
    ) return
    val sequence = stableEventProtocol.nextEvent(generation.value) ?: return
    val direction = if (candidate.index > current.index) "forward" else "backward"
    val adjacentIndex = current.index + if (direction == "forward") 1 else -1
    val adjacent = configuration.units.getOrNull(adjacentIndex)
    val payload = mutableMapOf<String, Any>(
      "boundary" to if (direction == "forward") "end" else "start",
      "direction" to direction,
      "generation" to generation.value,
      "instanceId" to instanceId,
      "kind" to if (adjacent == null) "publication" else "unit",
      "locator" to locator.toJSON().toEventValue(),
      "navigationUnitId" to current.unit.id,
      "precision" to current.precision,
      "sequence" to sequence,
    )
    adjacent?.let { payload["adjacentNavigationUnitId"] = it.id }
    onNavigationUnitBoundary(payload)
  }

  private fun updateAcceptedNavigationUnitMatch(locator: Locator) {
    val configuration = navigationUnitBoundaryConfiguration
    if (
      configuration == null ||
      configuration.generation != generation.value ||
      configuration.instanceId != instanceId
    ) {
      acceptedNavigationUnitMatch = null
      return
    }
    acceptedNavigationUnitMatch = NavigationUnitBoundaryPolicy.match(
      configuration,
      locator.toNavigationBoundaryLocation(),
      acceptedNavigationUnitMatch?.unit?.id,
    )
  }

  private fun preparePublicationData(
    publication: Publication,
    navigator: EpubNavigatorFragment,
    expectedGeneration: Long,
  ) {
    publicationDataJob?.cancel()
    publicationDataJob = scope.launch {
      val startedAt = SystemClock.elapsedRealtime()
      val positions = runCatching { publication.positions() }.getOrDefault(emptyList())
      val snapshot = withContext(Dispatchers.Default) {
        PublicationDataMapper.map(
          publication = publication,
          positions = positions,
          continuousProgressAvailable = false,
        )
      }
      if (
        !isCurrent(expectedGeneration) ||
        publication !== activePublication ||
        navigator !== this@EpubReaderView.navigator
      ) {
        return@launch
      }

      preparedPublicationData = PreparedPublicationData(
        generation = expectedGeneration,
        mappingDurationMilliseconds = SystemClock.elapsedRealtime() - startedAt,
        positions = positions,
        snapshot = snapshot,
      )
      publicationDataJob = null
      if (readerReadinessGate.markPublicationDataReady(expectedGeneration)) {
        completePublicationPreparation(expectedGeneration)
      }
    }
  }

  private fun markNavigatorViewportReady(expectedGeneration: Long) {
    if (!isCurrent(expectedGeneration)) return
    if (readerReadinessGate.markViewportReady(expectedGeneration)) {
      completePublicationPreparation(expectedGeneration)
    }
    if (currentReaderState == StableReaderState.READY) {
      scheduleTypographyDiagnostics(expectedGeneration)
    }
  }

  private fun completePublicationPreparation(expectedGeneration: Long) {
    val prepared = preparedPublicationData
      ?.takeIf { it.generation == expectedGeneration }
      ?: return
    val publication = activePublication ?: return
    val currentNavigator = navigator ?: return
    if (!isCurrent(expectedGeneration)) return

    navigatorReadinessTimeoutJob?.cancel()
    navigatorReadinessTimeoutJob = null
    preparedPublicationData = null
    publicationData = prepared.snapshot
    nativePositions = prepared.positions
    publicationDataMappingDurationMilliseconds = prepared.mappingDurationMilliseconds
    totalPositionCount = prepared.snapshot.positions.size
    progressReadyGeneration = expectedGeneration
    emitPreferencesStatus(
      preferences = configuredPreferences,
      fixedLayout = publication.metadata.presentation.layout == EpubLayout.FIXED,
    )
    configureImageInputListener()
    configureDirectionalInputAdapter()
    emitNavigationPolicyStatus()
    startProgressObservation(publication, currentNavigator, expectedGeneration)
    scheduleTypographyDiagnostics(expectedGeneration)
    statusLabel.visibility = View.GONE
    emitState("ready", suppliedGeneration = expectedGeneration)
  }

  private fun scheduleNavigatorReadinessTimeout(expectedGeneration: Long) {
    navigatorReadinessTimeoutJob?.cancel()
    navigatorReadinessTimeoutJob = scope.launch {
      delay(NAVIGATOR_READINESS_TIMEOUT_MILLISECONDS)
      if (
        !isCurrent(expectedGeneration) ||
        !readerReadinessGate.isWaiting(expectedGeneration)
      ) {
        return@launch
      }
      navigatorReadinessTimeoutJob = null
      clearSession(removeFragment = true)
      finishWithError(
        code = "NAVIGATOR_CREATION_FAILED",
        phase = "render",
        message = "The EPUB viewport did not become ready.",
        recoverable = true,
        generation = expectedGeneration,
      )
    }
  }

  private fun probeProgress() {
    val expectedGeneration = generation.value
    val currentNavigator = navigator ?: return
    if (progressReadyGeneration != expectedGeneration) return
    progressProbeJob?.cancel()
    progressProbeJob = scope.launch {
      val visibleStart = runCatching { currentNavigator.firstVisibleElementLocator() }.getOrNull()
      if (!isCurrent(expectedGeneration) || currentNavigator !== navigator) {
        return@launch
      }
      emitProgress(currentNavigator.currentLocator.value, "probe", visibleStart)
      progressProbeJob = null
    }
  }

  private fun emitProgress(
    locator: Locator,
    requestedReason: String,
    visibleStartLocator: Locator? = null,
  ) {
    val publication = activePublication ?: return
    val expectedGeneration = generation.value
    if (progressReadyGeneration != expectedGeneration) return

    val readingOrder = publication.readingOrder
    val resourceIndex = readingOrderIndex(locator, readingOrder).coerceAtLeast(0)
    val totalResources = max(readingOrder.size, 1)
    val resourceProgress = clampProgress(locator.locations.progression) ?: 0.0
    val fallbackOverall = clampProgress(
      (resourceIndex.toDouble() + resourceProgress) / totalResources.toDouble()
    ) ?: 0.0
    val overallProgress = clampProgress(locator.locations.totalProgression) ?: fallbackOverall
    val precision = if (locator.locations.position != null && totalPositionCount != null) {
      "position"
    } else {
      "resource"
    }
    val reason = if (initialProgressGeneration == expectedGeneration) {
      requestedReason
    } else {
      firstLocationReason
    }
    initialProgressGeneration = expectedGeneration
    acceptedUserLocation = locator
    updateAcceptedNavigationUnitMatch(locator)
    if (reason != StableReaderLocationReason.USER_SCROLL.wireValue) {
      pendingUserLocationReason = StableReaderLocationReason.USER_SCROLL.wireValue
    }

    val payload = mutableMapOf<String, Any>(
      "chapterTurnGesture" to configuredNavigationPolicy.chapterTurnGesture,
      "generation" to expectedGeneration,
      "instanceId" to instanceId,
      "layout" to if (publication.metadata.presentation.layout == EpubLayout.FIXED) {
        "paginated"
      } else {
        configuredPreferences.layout
      },
      "locator" to locator.toJSON().toEventValue(),
      "overallProgress" to overallProgress,
      "platform" to "android",
      "precision" to precision,
      "reason" to reason,
      "resourceIndex" to resourceIndex,
      "resourceProgress" to resourceProgress,
      "totalResources" to totalResources,
    )
    locator.locations.position?.let { payload["position"] = it }
    totalPositionCount?.takeIf { it > 0 }?.let { payload["totalPositions"] = it }
    visibleStartLocator?.let {
      payload["visibleStartLocator"] = it.toJSON().toEventValue()
    }
    onProgress(payload)
    emitStableLocation(
      locator = locator,
      reason = reason,
      precision = precision,
      overallProgress = overallProgress,
    )
  }

  private fun emitStableLocation(
    locator: Locator,
    reason: String,
    precision: String,
    overallProgress: Double,
  ) {
    val stableReason = StableReaderLocationReason.fromWireValue(
      if (reason == "probe") "programmatic" else reason
    )
    val expectedGeneration = generation.value
    val sequence = stableEventProtocol.nextLocation(
      expectedGeneration,
      stableReason,
      SystemClock.uptimeMillis(),
    ) ?: return
    val payload = mutableMapOf<String, Any>(
      "generation" to expectedGeneration,
      "instanceId" to instanceId,
      "locator" to locator.toJSON().toEventValue(),
      "overallProgress" to overallProgress,
      "precision" to precision,
      "reason" to stableReason.wireValue,
      "sequence" to sequence,
    )
    locator.locations.position?.let { payload["position"] = it }
    totalPositionCount?.takeIf { it > 0 }?.let { payload["totalPositions"] = it }
    latestStableLocation = payload
    onLocationChange(payload)
  }

  private fun navigateToNextResource() {
    val expectedGeneration = generation.value
    val currentNavigator = navigator ?: return
    val publication = activePublication ?: return
    val sourceLocator = currentNavigator.currentLocator.value
    val sourcePayload = sourceLocator.toJSON().toEventValue()

    navigationJob?.cancel()
    navigationJob = scope.launch {
      val readingOrder = publication.readingOrder
      val sourceIndex = readingOrderIndex(sourceLocator, readingOrder)
      val targetLink = sourceIndex
        .takeIf { it >= 0 && it + 1 in readingOrder.indices }
        ?.let { readingOrder[it + 1] }
      val activityId = beginProgrammaticNavigationActivity()
      try {
        val success = targetLink?.let { currentNavigator.go(it, false) } ?: false
        if (success) delay(220)
        if (
          !isCurrent(expectedGeneration) ||
          publication !== activePublication ||
          currentNavigator !== navigator
        ) {
          return@launch
        }

        val destination = currentNavigator.currentLocator.value
        onNavigationAction(
          mapOf(
            "action" to "next-resource",
            "fromLocator" to sourcePayload,
            "generation" to expectedGeneration,
            "instanceId" to instanceId,
            "platform" to "android",
            "success" to success,
            "toLocator" to destination.toJSON().toEventValue(),
          )
        )
        emitProgress(destination, "programmatic")
        navigationJob = null
      } finally {
        endProgrammaticNavigationActivity(activityId)
      }
    }
  }

  private fun readingOrderIndex(locator: Locator, readingOrder: List<Link>): Int =
    readingOrder.indexOfFirst { link ->
      val target = link.href.toString().substringBefore('#').trimStart('/')
      val current = locator.href.removeFragment().path?.trimStart('/') ?: ""
      current == target || current.endsWith("/$target") || target.endsWith("/$current")
    }

  private fun resourcePathsMatch(left: Locator, right: Locator): Boolean {
    val leftPath = left.href.removeFragment().path?.trimStart('/') ?: ""
    val rightPath = right.href.removeFragment().path?.trimStart('/') ?: ""
    return leftPath == rightPath ||
      leftPath.endsWith("/$rightPath") ||
      rightPath.endsWith("/$leftPath")
  }

  private fun Locator.toNavigationBoundaryLocation(): ReaderNavigationBoundaryLocation =
    ReaderNavigationBoundaryLocation(
      href = href.toString(),
      fragments = locations.fragments,
      position = locations.position,
      totalProgression = locations.totalProgression,
    )

  private fun clampProgress(value: Double?): Double? {
    if (value == null || !value.isFinite()) return null
    return value.coerceIn(0.0, 1.0)
  }

  private fun scheduleSelectionAction(actionId: String) {
    val expectedGeneration = generation.value
    selectionActionJob?.cancel()
    selectionActionJob = scope.launch {
      try {
        // The WebView callback updates its selection asynchronously. Querying
        // Readium after one frame makes the action deterministic without ending
        // the native ActionMode or clearing its handles.
        delay(50)
        if (!isCurrent(expectedGeneration)) return@launch
        val currentNavigator = navigator ?: return@launch
        var selection = capturedSelection
        if (selection == null) {
          selection = currentNavigator.currentSelection()
        }
        for (attempt in 0 until 7) {
          if (selection != null) break
          delay(50)
          selection = currentNavigator.currentSelection()
        }
        selection ?: run {
          Log.w(LOG_TAG, "Readium returned no current selection after native action")
          return@launch
        }
        val currentSelection = selection ?: return@launch
        val snapshot = selectionSnapshot(currentSelection, currentNavigator) ?: return@launch
        acceptSelectionSnapshot(snapshot, currentSelection, handlesActive = true)
        val sequence = stableEventProtocol.nextEvent(expectedGeneration) ?: return@launch
        onSelectionAction(
          mapOf(
            "actionId" to actionId,
            "generation" to expectedGeneration,
            "handlesActive" to (isSelectionActionModeActive && capturedSelection != null),
            "instanceId" to instanceId,
            "platform" to "android",
            "selection" to snapshot,
            "sequence" to sequence,
          )
        )
      } finally {
        if (selectionActionJob === coroutineContext[Job]) selectionActionJob = null
      }
    }
  }

  private fun keepSelectionActionModeHidden(mode: ActionMode) {
    selectionActionModeHideJob?.cancel()
    selectionActionModeHideJob = scope.launch {
      try {
        while (isSelectionActionModeActive && activeSelectionActionMode === mode) {
          mode.hide(SELECTION_ACTION_MODE_HIDE_MILLISECONDS)
          delay(SELECTION_ACTION_MODE_REHIDE_MILLISECONDS)
        }
      } finally {
        if (selectionActionModeHideJob === coroutineContext[Job]) {
          selectionActionModeHideJob = null
        }
      }
    }
  }

  private fun scheduleSystemCopy(mode: ActionMode) {
    val expectedGeneration = generation.value
    selectionActionJob?.cancel()
    selectionActionJob = scope.launch {
      try {
        delay(50)
        if (!isCurrent(expectedGeneration)) return@launch
        val currentNavigator = navigator ?: return@launch
        val publication = activePublication ?: return@launch
        var selection = capturedSelection
        if (selection == null) selection = currentNavigator.currentSelection()
        for (attempt in 0 until 7) {
          if (selection != null) break
          delay(50)
          selection = currentNavigator.currentSelection()
        }
        val selectedText = selection?.locator?.text?.highlight?.takeIf(String::isNotEmpty)
          ?: return@launch
        if (!publication.rights.copy(selectedText)) return@launch
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
          ?: return@launch
        clipboard.setPrimaryClip(ClipData.newPlainText(null, selectedText))
        currentNavigator.clearSelection()
        mode.finish()
      } finally {
        if (selectionActionJob === coroutineContext[Job]) selectionActionJob = null
      }
    }
  }

  private fun scheduleSelectionCapture() {
    val expectedGeneration = generation.value
    selectionCaptureJob?.cancel()
    capturedSelection = null
    selectionCaptureJob = scope.launch {
      delay(50)
      while (isCurrent(expectedGeneration) && isSelectionActionModeActive) {
        val currentNavigator = navigator ?: return@launch
        val selection = currentNavigator.currentSelection()
        if (selection == null) {
          if (selectionLifecycleStarted) {
            endSelection("dismissed")
            return@launch
          }
        } else {
          capturedSelection = selection
          val nativeFingerprint = nativeSelectionFingerprint(selection)
          if (nativeFingerprint != latestNativeSelectionFingerprint) {
            selectionSnapshot(selection, currentNavigator)?.let {
              acceptSelectionSnapshot(it, selection, handlesActive = true)
            }
          }
        }
        delay(100)
      }
      selectionCaptureJob = null
    }
  }

  private fun selectionSnapshot(
    selection: Selection,
    currentNavigator: EpubNavigatorFragment,
  ): Map<String, Any>? {
    val publication = activePublication ?: return null
    val selectedText = selection.locator.text.highlight ?: ""
    val copyAllowed = publication.rights.canCopy(selectedText)
    val boundedText = SelectionTextBounder.bound(
      selectedText,
      SelectionActionPolicy.MAXIMUM_SELECTION_TEXT_UTF16_UNITS,
    )
    var truncated = boundedText.truncated
    val locator = selection.locator.toJSON()
    if (copyAllowed) {
      val locatorText = locator.optJSONObject("text") ?: JSONObject()
      val before = SelectionTextBounder.boundEnd(
        selection.locator.text.before ?: "",
        SelectionActionPolicy.MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS,
      )
      val after = SelectionTextBounder.bound(
        selection.locator.text.after ?: "",
        SelectionActionPolicy.MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS,
      )
      locatorText.put("highlight", boundedText.text)
      if (before.text.isEmpty()) locatorText.remove("before")
      else locatorText.put("before", before.text)
      if (after.text.isEmpty()) locatorText.remove("after")
      else locatorText.put("after", after.text)
      locator.put("text", locatorText)
      truncated = truncated || before.truncated || after.truncated
    } else {
      locator.remove("text")
    }

    val snapshot = mutableMapOf<String, Any>(
      "copyAllowed" to copyAllowed,
      "direction" to SelectionActionPolicy.textDirection(selectedText),
      "locator" to locator.toEventValue(),
      "text" to if (copyAllowed) boundedText.text else "",
      "truncated" to truncated,
    )
    acceptedNavigationUnitMatch?.unit?.id?.let { snapshot["navigationUnitId"] = it }
    selectionGeometry(selection, currentNavigator)?.let { snapshot["geometry"] = it }
    return snapshot
  }

  private fun selectionGeometry(
    selection: Selection,
    currentNavigator: EpubNavigatorFragment,
  ): Map<String, Any>? {
    val native = selection.rect?.let {
      RectValue(
        x = min(it.left, it.right).toDouble(),
        y = min(it.top, it.bottom).toDouble(),
        width = abs(it.width()).toDouble(),
        height = abs(it.height()).toDouble(),
      )
    } ?: return null
    return nativeGeometry(native, currentNavigator)
  }

  private fun nativeGeometry(
    native: RectValue,
    currentNavigator: EpubNavigatorFragment,
  ): Map<String, Any>? {
    val publicationView = currentNavigator.publicationView
    val publicationWindow = IntArray(2).also(publicationView::getLocationInWindow)
    val readerWindow = IntArray(2).also(this@EpubReaderView::getLocationInWindow)
    val geometry = SelectionGeometryNormalizer.normalize(
      nativeRect = native,
      publicationWindowXpx = publicationWindow[0],
      publicationWindowYpx = publicationWindow[1],
      readerWindowXpx = readerWindow[0],
      readerWindowYpx = readerWindow[1],
      readerWidthPx = width,
      readerHeightPx = height,
      density = resources.displayMetrics.density.toDouble(),
    ) ?: return null
    return mapOf(
      "coordinateSpace" to "reader-view-and-window-v1",
      "viewRect" to geometry.viewRect.eventPayload(),
      "visibleViewRect" to geometry.visibleViewRect.eventPayload(),
      "viewport" to mapOf(
        "height" to geometry.readerWindowRect.height,
        "width" to geometry.readerWindowRect.width,
      ),
      "windowRect" to geometry.windowRect.eventPayload(),
      "visibleWindowRect" to geometry.visibleWindowRect.eventPayload(),
    )
  }

  private fun acceptSelectionSnapshot(
    snapshot: Map<String, Any>,
    nativeSelection: Selection,
    handlesActive: Boolean,
  ) {
    val fingerprint = JSONObject(snapshot).toString()
    latestNativeSelectionFingerprint = nativeSelectionFingerprint(nativeSelection)
    if (fingerprint == latestSelectionFingerprint) return
    val reason = if (selectionLifecycleStarted) "changed" else "started"
    selectionLifecycleStarted = true
    latestSelectionSnapshot = snapshot
    latestSelectionFingerprint = fingerprint
    val sequence = stableEventProtocol.nextEvent(generation.value) ?: return
    onSelectionChange(
      mapOf(
        "generation" to generation.value,
        "handlesActive" to handlesActive,
        "instanceId" to instanceId,
        "platform" to "android",
        "reason" to reason,
        "selection" to snapshot,
        "sequence" to sequence,
      )
    )
  }

  private fun endSelection(reason: String) {
    selectionActionJob?.cancel()
    selectionActionJob = null
    selectionActionModeHideJob?.cancel()
    selectionActionModeHideJob = null
    selectionActionModeDestroyJob?.cancel()
    selectionActionModeDestroyJob = null
    selectionCaptureJob?.cancel()
    selectionCaptureJob = null
    capturedSelection = null
    activeSelectionActionMode = null
    isSelectionActionModeActive = false
    suppressSelectionActionModeUntilSelectionEnds = false
    latestNativeSelectionFingerprint = null
    latestSelectionFingerprint = null
    latestSelectionSnapshot = null
    if (!selectionLifecycleStarted) return
    selectionLifecycleStarted = false
    val sequence = stableEventProtocol.nextEvent(generation.value) ?: return
    onSelectionChange(
      mapOf(
        "generation" to generation.value,
        "handlesActive" to false,
        "instanceId" to instanceId,
        "platform" to "android",
        "reason" to reason,
        "selection" to null,
        "sequence" to sequence,
      )
    )
  }

  private fun nativeSelectionFingerprint(selection: Selection): String = buildString {
    append(selection.locator.toJSON().toString())
    selection.rect?.let {
      append('|').append(it.left).append(',').append(it.top)
        .append(',').append(it.right).append(',').append(it.bottom)
    }
  }

  private fun applyPreferences(previous: ResolvedReaderPreferences) {
    if (currentReaderState != StableReaderState.READY) return
    val currentNavigator = navigator ?: return
    val publication = activePublication ?: return
    val next = configuredPreferences
    val fixedLayout = publication.metadata.presentation.layout == EpubLayout.FIXED
    emitPreferencesStatus(next, fixedLayout)
    val previousPolicy = ReaderPreferencesPolicy.resolve(previous, fixedLayout)
    val nextPolicy = ReaderPreferencesPolicy.resolve(next, fixedLayout)
    if (
      previousPolicy.appliedNames == nextPolicy.appliedNames &&
      previousPolicy.appliedMap(previous) == nextPolicy.appliedMap(next)
    ) {
      return
    }

    preferenceUpdateJob?.cancel()
    preferenceUpdateSerial += 1
    val updateSerial = preferenceUpdateSerial
    val expectedGeneration = generation.value
    val profile = configuredTypographyProfile
    preferenceUpdateJob = scope.launch {
      try {
        var navigationWaitCount = 0
        while (activeNavigationCommandId != null && navigationWaitCount < 40) {
          delay(50)
          navigationWaitCount += 1
        }
        if (
          updateSerial != preferenceUpdateSerial ||
          activeNavigationCommandId != null ||
          !generation.isCurrent(expectedGeneration) ||
          currentNavigator !== navigator ||
          publication !== activePublication ||
          currentReaderState != StableReaderState.READY
        ) {
          return@launch
        }

        val anchor = currentNavigator.currentLocator.value
        currentNavigator.submitPreferences(
          readiumPreferences(next, fixedLayout = fixedLayout, typographyProfile = profile)
        )
        delay(250)
        if (
          updateSerial != preferenceUpdateSerial ||
          !generation.isCurrent(expectedGeneration) ||
          currentNavigator !== navigator ||
          publication !== activePublication ||
          currentReaderState != StableReaderState.READY
        ) {
          return@launch
        }
        if (currentNavigator.go(anchor, false)) {
          awaitNavigationSettlement(currentNavigator, anchor)
        }
        delay(120)
        if (
          updateSerial != preferenceUpdateSerial ||
          !generation.isCurrent(expectedGeneration) ||
          currentNavigator !== navigator ||
          publication !== activePublication ||
          currentReaderState != StableReaderState.READY
        ) {
          return@launch
        }
        emitNavigationPolicyStatus()
        emitProgress(
          currentNavigator.currentLocator.value,
          StableReaderLocationReason.PREFERENCE_CHANGE.wireValue,
        )
      } finally {
        if (updateSerial == preferenceUpdateSerial) preferenceUpdateJob = null
      }
    }
  }

  private fun effectiveReaderLayout(): String =
    if (activePublication?.metadata?.presentation?.layout == EpubLayout.FIXED) {
      "paginated"
    } else {
      if (navigator?.overflow?.value?.scroll == true) "scrolled" else "paginated"
    }

  private fun effectiveReadingProgression(): String =
    if (navigator?.overflow?.value?.readingProgression == ReadiumReadingProgression.RTL) {
      "rtl"
    } else {
      "ltr"
    }

  private fun applyNavigationPolicy(previous: ResolvedReaderNavigationPolicy) {
    if (currentReaderState != StableReaderState.READY) return
    if (ReaderNavigationPolicy.requiresNavigatorRecreation(previous, configuredNavigationPolicy)) {
      navigator?.currentLocator?.value?.let {
        pendingInitialLocator = it
        pendingInitialLocatorReason = StableReaderLocationReason.RESTORED
      }
      navigationPolicyApplication = "navigator-recreation"
      restartSession()
      return
    }
    navigationPolicyApplication = "live"
    configureDirectionalInputAdapter()
    emitNavigationPolicyStatus()
  }

  private fun configureDirectionalInputAdapter() {
    val currentNavigator = navigator ?: return
    directionalInputAdapter?.let { currentNavigator.removeInputListener(it) }
    val adapter = ReaderDirectionalInputAdapter(
      navigator = currentNavigator,
      policy = { configuredNavigationPolicy },
      onNavigation = {
        pendingUserLocationReason = StableReaderLocationReason.USER_PAGE_TURN.wireValue
      },
    )
    currentNavigator.addInputListener(adapter)
    directionalInputAdapter = adapter
  }

  private fun emitNavigationPolicyStatus() {
    if (navigator == null || activePublication == null) return
    val configuration = navigationUnitBoundaryConfiguration
    val boundaryGranularity: String
    val boundaryPrecision: String
    val boundaryWarnings: List<String>
    if (
      configuration != null &&
      configuration.generation == generation.value &&
      configuration.instanceId == instanceId
    ) {
      boundaryGranularity = "navigation-unit"
      boundaryPrecision = configuration.precision
      boundaryWarnings = emptyList()
    } else if (configuredNavigationUnitBoundariesRequired) {
      boundaryGranularity = "reading-order-resource"
      boundaryPrecision = "pending"
      boundaryWarnings = listOf("navigation-unit-boundaries-loading")
    } else {
      boundaryGranularity = "reading-order-resource"
      boundaryPrecision = "resource"
      boundaryWarnings = listOf("chapter-boundaries-use-reading-order-resources")
    }
    val payload = ReaderNavigationPolicy.statusPayload(
      policy = configuredNavigationPolicy,
      application = navigationPolicyApplication,
      boundaryGranularity = boundaryGranularity,
      boundaryPrecision = boundaryPrecision,
      boundaryWarnings = boundaryWarnings,
      effectiveLayout = effectiveReaderLayout(),
      readingProgression = effectiveReadingProgression(),
      instanceId = instanceId,
      generation = generation.value,
    )
    latestNavigationPolicyStatus = payload
    onNavigationPolicyChange(payload)
  }

  private fun emitPreferencesStatus(
    preferences: ResolvedReaderPreferences,
    fixedLayout: Boolean,
  ) {
    val payload = ReaderPreferencesPolicy.statusPayload(
      preferences = preferences,
      fixedLayout = fixedLayout,
      instanceId = instanceId,
      generation = generation.value,
    )
    latestPreferencesStatus = payload
    onPreferencesChange(payload)
  }

  private fun readiumPreferences(
    preferences: ResolvedReaderPreferences,
    fixedLayout: Boolean,
    typographyProfile: ResolvedTypographyProfile?,
  ): EpubPreferences {
    val readingProgression = when (preferences.readingProgression) {
      "ltr" -> ReadiumReadingProgression.LTR
      "rtl" -> ReadiumReadingProgression.RTL
      else -> null
    }
    if (fixedLayout) {
      return EpubPreferences(
        readingProgression = readingProgression,
        spread = readiumSpreadPreference(preferences.spread),
      )
    }
    val publisherStyles = typographyProfile?.publisherStyles?.publisherStyles
      ?: preferences.publisherStyles
    return EpubPreferences(
      fontSize = preferences.fontSize,
      lineHeight = preferences.lineHeight.takeUnless { publisherStyles },
      pageMargins = preferences.pageMargins,
      publisherStyles = publisherStyles,
      readingProgression = readingProgression,
      scroll = preferences.layout == "scrolled",
      textAlign = if (publisherStyles || preferences.textAlignment == "auto") {
        null
      } else {
        when (preferences.textAlignment) {
          "start" -> ReadiumTextAlign.START
          "end" -> ReadiumTextAlign.END
          "left" -> ReadiumTextAlign.LEFT
          "right" -> ReadiumTextAlign.RIGHT
          "center" -> ReadiumTextAlign.CENTER
          "justify" -> ReadiumTextAlign.JUSTIFY
          else -> null
        }
      },
      theme = when (preferences.theme) {
        "dark" -> ReadiumTheme.DARK
        "sepia" -> ReadiumTheme.SEPIA
        else -> ReadiumTheme.LIGHT
      },
    )
  }

  fun getCurrentLocationCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    return mapOf("ok" to true, "value" to latestStableLocation)
  }

  fun getCurrentSelectionCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    return mapOf("ok" to true, "value" to latestSelectionSnapshot)
  }

  fun getPublicationCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    val snapshot = publicationData ?: return publicationDataUnavailableResult()
    return mapOf(
      "ok" to true,
      "value" to snapshot.publicationInfoValue(
        instanceId = instanceId,
        generation = generation.value,
        mappingDurationMilliseconds = publicationDataMappingDurationMilliseconds,
      ),
    )
  }

  fun getPositionsCommand(offset: Int, limit: Int): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    val snapshot = publicationData ?: return publicationDataUnavailableResult()
    return mapOf(
      "ok" to true,
      "value" to snapshot.positionsPageValue(
        instanceId = instanceId,
        generation = generation.value,
        requestedOffset = offset,
        requestedLimit = limit,
      ),
    )
  }

  fun getPreferencesCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    val status = latestPreferencesStatus ?: return publicationDataUnavailableResult()
    return mapOf("ok" to true, "value" to status)
  }

  fun getNavigationPolicyCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    val status = latestNavigationPolicyStatus ?: return publicationDataUnavailableResult()
    return mapOf("ok" to true, "value" to status)
  }

  fun setNavigationUnitBoundariesCommand(configurationJson: String): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    val currentNavigator = navigator
      ?: return publicationDataUnavailableResult()
    if (!configuredNavigationUnitBoundariesRequired) {
      return navigationErrorResult(
        code = "INVALID_LOCATOR",
        message = "Navigation-unit boundaries are not configured for this reader.",
      )
    }
    val configuration = runCatching {
      ReaderNavigationUnitBoundaryConfiguration.decode(configurationJson)
    }.getOrElse {
      return navigationErrorResult(
        code = "INVALID_LOCATOR",
        message = "The navigation-unit boundary configuration is invalid.",
      )
    }
    if (configuration.generation != generation.value || configuration.instanceId != instanceId) {
      return navigationGenerationChangedResult()
    }
    navigationUnitBoundaryConfiguration = configuration
    acceptedNavigationUnitMatch = NavigationUnitBoundaryPolicy.match(
      configuration,
      currentNavigator.currentLocator.value.toNavigationBoundaryLocation(),
    )
    emitNavigationPolicyStatus()
    return mapOf("ok" to true, "value" to true)
  }

  fun getDiagnosticsCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    val snapshot = publicationData ?: return publicationDataUnavailableResult()
    val preferencesStatus = latestPreferencesStatus ?: return publicationDataUnavailableResult()
    val value = ReaderDiagnosticsPolicy.payload(
      platform = "android",
      sdkVersion = NativeDependencyVersions.NATIVE_EPUB_KIT,
      toolkitName = "readium-kotlin",
      toolkitVersion = NativeDependencyVersions.READIUM_KOTLIN,
      toolkitRevision = NativeDependencyVersions.READIUM_KOTLIN_REVISION,
      generation = generation.value,
      publication = snapshot.diagnosticsInput(publicationDataMappingDurationMilliseconds),
      fonts = NativeFontRegistry.diagnostics(context.applicationContext, installedFonts),
      preferencesStatus = preferencesStatus,
    )
    return mapOf("ok" to true, "value" to value)
  }

  suspend fun startSearchCommand(
    query: String,
    optionsJson: String,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    val publication = activePublication ?: return@withContext publicationDataUnavailableResult()
    val request = runCatching { ReaderSearchPolicy.resolve(query, optionsJson) }
      .getOrElse {
        return@withContext searchErrorResult("The search request is invalid.")
      }
    val expectedGeneration = generation.value
    try {
      val snapshot = searchCoordinator.start(
        publication = publication,
        generation = expectedGeneration,
        instanceId = instanceId,
        request = request,
      )
      if (!isCurrent(expectedGeneration) || activePublication !== publication) {
        searchCoordinator.cancel(snapshot.id)
        return@withContext searchErrorResult(
          "The search was cancelled because the reader changed.",
        )
      }
      mapOf(
        "ok" to true,
        "value" to mapOf(
          "decorationGroups" to ReaderSearchPolicy.DECORATION_GROUPS,
          "generation" to snapshot.generation,
          "id" to snapshot.id,
          "instanceId" to snapshot.instanceId,
          "nextCursor" to snapshot.nextCursor,
          "options" to snapshot.options.toJson().toEventValue(),
          "query" to snapshot.query,
        ),
      )
    } catch (error: ReaderSearchCoordinatorException) {
      searchCoordinatorErrorResult(error)
    } catch (_: Throwable) {
      searchErrorResult("The publication search could not be started.")
    }
  }

  suspend fun getSearchPageCommand(
    sessionId: String,
    cursor: String,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    val identifiersValid = runCatching {
      ReaderSearchPolicy.validateSessionId(sessionId)
      ReaderSearchPolicy.validateCursor(cursor, allowInitialEmpty = true)
    }.isSuccess
    if (!identifiersValid) {
      return@withContext searchErrorResult("The search session or page cursor is invalid.")
    }
    val expectedGeneration = generation.value
    try {
      val page = searchCoordinator.page(sessionId, cursor)
      if (!isCurrent(expectedGeneration) || page.generation != generation.value) {
        return@withContext searchErrorResult(
          "The search was cancelled because the reader changed.",
        )
      }
      mapOf(
        "ok" to true,
        "value" to buildMap<String, Any?> {
          put("complete", page.complete)
          put("cursor", page.cursor)
          put("generation", page.generation)
          put("instanceId", page.instanceId)
          put("loadedResultCount", page.loadedResultCount)
          page.nextCursor?.let { put("nextCursor", it) }
          put("results", page.results.map(::searchResultValue))
          put("sessionId", page.sessionId)
          put("truncated", page.truncated)
        },
      )
    } catch (error: ReaderSearchCoordinatorException) {
      searchCoordinatorErrorResult(error)
    } catch (_: Throwable) {
      searchErrorResult("The next search page could not be loaded.")
    }
  }

  fun cancelSearchCommand(sessionId: String): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    if (runCatching { ReaderSearchPolicy.validateSessionId(sessionId) }.isFailure) {
      return searchErrorResult("The search session is invalid.")
    }
    searchCoordinator.cancel(sessionId)
    return mapOf("ok" to true)
  }

  private fun searchResultValue(result: ReaderSearchIndexedLocator): Map<String, Any?> {
    val locator = result.locator
    val excerpt = ReaderSearchPolicy.excerpt(
      before = locator.text.before ?: "",
      highlight = locator.text.highlight ?: "",
      after = locator.text.after ?: "",
    )
    val locatorValue = locator.toJSON().toEventValue().toMutableMap()
    val text = buildMap<String, Any> {
      if (excerpt.before.isNotEmpty()) put("before", excerpt.before)
      if (excerpt.highlight.isNotEmpty()) put("highlight", excerpt.highlight)
      if (excerpt.after.isNotEmpty()) put("after", excerpt.after)
    }
    if (text.isEmpty()) locatorValue.remove("text") else locatorValue["text"] = text

    return buildMap {
      put("excerpt", excerpt.toMap())
      put("id", "search-result:${result.index}")
      put("index", result.index)
      put("locator", locatorValue)
      ReaderSearchPolicy.resourceTitle(locator.title)?.let { put("resourceTitle", it) }
      val configuration = navigationUnitBoundaryConfiguration
      if (
        configuration != null &&
        configuration.generation == generation.value &&
        configuration.instanceId == instanceId
      ) {
        NavigationUnitBoundaryPolicy.match(
          configuration,
          locator.toNavigationBoundaryLocation(),
        )?.let { match ->
          put(
            "navigationUnit",
            mapOf(
              "id" to match.unit.id,
              "index" to match.index,
              "precision" to match.precision,
            ),
          )
        }
      }
    }
  }

  suspend fun resolveImageSourceCommand(
    handle: String,
    use: String,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    val imageUse = ReaderImageUse.from(use)
    if (imageUse == null || !ReaderImagePolicy.allows(imageUse, configuredImagePolicy)) {
      return@withContext imageResourceErrorResult(
        "SOURCE_PERMISSION_DENIED",
        "The requested image use is not allowed by the current image policy.",
      )
    }
    val source = runCatching { ReaderImagePolicy.validateSourceHandle(handle) }
      .getOrNull()
      ?.let(imageSources::get)
      ?.takeIf { it.generation == generation.value }
      ?: return@withContext imageResourceErrorResult(
        "RESOURCE_LOAD_FAILED",
        "The image source handle is invalid or no longer belongs to this reader generation.",
      )
    val publication = activePublication ?: return@withContext publicationDataUnavailableResult()
    if (resolvedImageFiles.size >= MAXIMUM_RESOLVED_IMAGE_FILES) {
      return@withContext imageResourceErrorResult(
        "RESOURCE_LOAD_FAILED",
        "Too many resolved image files are active; release an existing image source first.",
      )
    }
    val expectedGeneration = generation.value
    val data = when (val payload = source.payload) {
      is NativeReaderImagePayload.InlineSVG -> payload.data
      is NativeReaderImagePayload.PublicationResource -> {
        val resource = publication.get(payload.href)
          ?: return@withContext imageResourceErrorResult(
            "RESOURCE_LOAD_FAILED",
            "The image resource is no longer available in this publication.",
          )
        try {
          val length = resource.length().getOrNull()
          if (length != null && length > MAXIMUM_RESOLVED_IMAGE_BYTES) {
            return@withContext imageResourceErrorResult(
              "RESOURCE_LOAD_FAILED",
              "The image resource exceeds the supported size limit.",
            )
          }
          val value = resource.read(0L until (MAXIMUM_RESOLVED_IMAGE_BYTES + 1L)).getOrNull()
          if (value == null || value.size > MAXIMUM_RESOLVED_IMAGE_BYTES) {
            return@withContext imageResourceErrorResult(
              "RESOURCE_LOAD_FAILED",
              "The image resource could not be read within the supported size limit.",
            )
          }
          value
        } finally {
          resource.close()
        }
      }
    }
    if (!isCurrent(expectedGeneration) || imageSources[handle]?.generation != expectedGeneration) {
      return@withContext imageResourceErrorResult(
        "RESOURCE_LOAD_FAILED",
        "The reader generation changed while resolving the image resource.",
      )
    }
    val identifier = UUID.randomUUID().toString()
    val file = File(
      imageResourceDirectory,
      "$identifier.${imageFileExtension(source.contentType)}",
    )
    val wrote = withContext(Dispatchers.IO) {
      runCatching {
        check(imageResourceDirectory.mkdirs() || imageResourceDirectory.isDirectory)
        file.writeBytes(data)
      }.isSuccess
    }
    if (!wrote) {
      return@withContext imageResourceErrorResult(
        "RESOURCE_LOAD_FAILED",
        "The resolved image resource could not be materialized.",
      )
    }
    if (!isCurrent(expectedGeneration)) {
      withContext(Dispatchers.IO) { file.delete() }
      return@withContext imageResourceErrorResult(
        "RESOURCE_LOAD_FAILED",
        "The reader generation changed while resolving the image resource.",
      )
    }
    resolvedImageFiles[identifier] = file
    mapOf(
      "ok" to true,
      "value" to mapOf(
        "byteLength" to data.size,
        "contentType" to source.contentType,
        "id" to identifier,
        "uri" to android.net.Uri.fromFile(file).toString(),
      ),
    )
  }

  fun releaseImageSourceCommand(id: String): Map<String, Any?> {
    resolvedImageFiles.remove(id)?.delete()
    return mapOf("ok" to true, "value" to true)
  }

  private fun imageFileExtension(contentType: String): String = when (contentType.lowercase()) {
    "image/gif" -> "gif"
    "image/jpeg" -> "jpg"
    "image/png" -> "png"
    "image/svg+xml" -> "svg"
    "image/webp" -> "webp"
    else -> "img"
  }

  fun clearSelectionCommand(): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    endSelection("cleared")
    navigator?.clearSelection()
    return mapOf("ok" to true)
  }

  suspend fun setDecorationsCommand(
    group: String,
    decorationsJson: String,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    if (decorationUpdateInFlight) {
      return@withContext decorationErrorResult("Another decoration update is already in progress.")
    }
    val resolved = try {
      val input = JSONTokener(decorationsJson).nextValue() as? JSONArray
        ?: throw DecorationPolicyException("$/decorations", "must be an array")
      DecorationPolicy.resolveDecorations(group, input)
    } catch (_: Throwable) {
      return@withContext decorationErrorResult("The decoration group state is invalid.")
    }
    decorationUpdateInFlight = true
    try {
      commitDecorationGroup(resolved.first, resolved.second)
    } catch (failure: CancellationException) {
      throw failure
    } catch (_: Throwable) {
      decorationErrorResult("The decoration group state is invalid.")
    } finally {
      decorationUpdateInFlight = false
    }
  }

  suspend fun updateDecorationsCommand(
    group: String,
    changesJson: String,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    if (decorationUpdateInFlight) {
      return@withContext decorationErrorResult("Another decoration update is already in progress.")
    }
    val resolved = try {
      val input = JSONTokener(changesJson).nextValue() as? JSONArray
        ?: throw DecorationPolicyException("$/changes", "must be an array")
      DecorationPolicy.resolveChanges(group, input)
    } catch (_: Throwable) {
      return@withContext decorationErrorResult("The decoration delta is invalid.")
    }
    val next = try {
      DecorationPolicy.applyChanges(
        decorationGroups[resolved.first] ?: emptyList(),
        resolved.second,
      )
    } catch (_: Throwable) {
      return@withContext decorationErrorResult("The decoration delta is invalid.")
    }
    decorationUpdateInFlight = true
    try {
      commitDecorationGroup(resolved.first, next)
    } catch (failure: CancellationException) {
      throw failure
    } catch (_: Throwable) {
      decorationErrorResult("The decoration delta is invalid.")
    } finally {
      decorationUpdateInFlight = false
    }
  }

  private suspend fun commitDecorationGroup(
    group: String,
    records: List<ResolvedNativeDecoration>,
  ): Map<String, Any?> {
    val currentNavigator = navigator ?: return publicationDataUnavailableResult()
    if (
      records.isNotEmpty() &&
      decorationGroups[group] == null &&
      decorationGroups.size >= DecorationPolicy.MAXIMUM_GROUPS
    ) {
      return decorationErrorResult(
        "The reader supports at most ${DecorationPolicy.MAXIMUM_GROUPS} active decoration groups.",
      )
    }
    val rendered = records.map(NativeDecorationRenderer::readiumDecoration)
    val expectedGeneration = generation.value
    if (records.isNotEmpty()) observeDecorationInteractions(group, currentNavigator)
    currentNavigator.applyDecorations(rendered, group)
    if (
      !generation.isCurrent(expectedGeneration) ||
      currentNavigator !== navigator ||
      currentReaderState != StableReaderState.READY
    ) {
      return navigationGenerationChangedResult()
    }
    if (records.isEmpty()) decorationGroups.remove(group)
    else decorationGroups[group] = records
    return mapOf("ok" to true, "value" to true)
  }

  suspend fun goToLocatorCommand(
    locatorJson: String,
    animated: Boolean,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    val locator = runCatching {
      val json = JSONTokener(locatorJson).nextValue() as? JSONObject
        ?: throw SharedRecordValidationException("$", "must be an object")
      val record = SharedCoreRecordCodec.decode(
        SharedCoreRecordType.LOCATOR,
        json,
      ) as SharedLocatorRecord
      Locator.fromJSON(record.json)
        ?: throw SharedRecordValidationException("$", "is not a valid Readium locator")
    }.getOrElse {
      return@withContext navigationErrorResult(
        code = "INVALID_LOCATOR",
        message = "The locator record is invalid.",
      )
    }
    performNavigationCommand(animated) { _, publication ->
      publication.locate(locator)?.let(NavigationDestination::Target)
        ?: NavigationDestination.InvalidTarget(
          "The locator does not resolve in this publication."
        )
    }
  }

  suspend fun goToLinkCommand(
    href: String,
    animated: Boolean,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    val trimmedHref = href.trim()
    if (trimmedHref.isEmpty()) {
      return@withContext navigationErrorResult(
        code = "INVALID_LOCATOR",
        message = "The publication link href is empty.",
      )
    }
    performNavigationCommand(animated) { _, publication ->
      publicationLink(trimmedHref, publication)?.let(NavigationDestination::PublicationLink)
        ?: NavigationDestination.InvalidTarget(
          "The publication link does not resolve in this publication."
        )
    }
  }

  suspend fun goToProgressionCommand(
    progression: Double,
    animated: Boolean,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    if (!NavigationPolicy.progressionIsValid(progression)) {
      return@withContext navigationErrorResult(
        code = "INVALID_LOCATOR",
        message = "Publication progression must be within 0...1.",
      )
    }
    performNavigationCommand(animated) { _, publication ->
      publication.locateProgression(progression)?.let(NavigationDestination::Target)
        ?: NavigationDestination.InvalidTarget(
          "The publication progression could not be located."
        )
    }
  }

  suspend fun goToPositionCommand(
    position: Int,
    animated: Boolean,
  ): Map<String, Any?> = withContext(Dispatchers.Main.immediate) {
    commandErrorResult()?.let { return@withContext it }
    if (!NavigationPolicy.positionIsValid(position) || position > nativePositions.size) {
      return@withContext navigationErrorResult(
        code = "INVALID_LOCATOR",
        message = "The publication position is outside the available positions snapshot.",
      )
    }
    val target = nativePositions.firstOrNull { it.locations.position == position }
      ?: nativePositions[position - 1]
    performNavigationCommand(animated) { _, _ -> NavigationDestination.Target(target) }
  }

  suspend fun goForwardCommand(animated: Boolean): Map<String, Any?> =
    withContext(Dispatchers.Main.immediate) {
      performLogicalNavigationCommand(animated, forward = true)
    }

  suspend fun goBackwardCommand(animated: Boolean): Map<String, Any?> =
    withContext(Dispatchers.Main.immediate) {
      performLogicalNavigationCommand(animated, forward = false)
    }

  private sealed interface NavigationDestination {
    data class InvalidTarget(val message: String) : NavigationDestination
    data class PublicationLink(val link: Link) : NavigationDestination
    data class Target(val locator: Locator) : NavigationDestination
  }

  private suspend fun performNavigationCommand(
    animated: Boolean,
    resolve: suspend (EpubNavigatorFragment, Publication) -> NavigationDestination,
  ): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    if (activeNavigationCommandId != null || preferenceUpdateJob != null) {
      return navigationErrorResult(
        code = "NAVIGATION_FAILED",
        message = "Another navigation or preference update is already in progress.",
      )
    }
    val currentNavigator = navigator ?: return publicationDataUnavailableResult()
    val publication = activePublication ?: return publicationDataUnavailableResult()
    val expectedGeneration = generation.value
    var commandId = beginProgrammaticNavigationActivity()
    activeNavigationCommandId = commandId
    try {
      val destination = resolve(currentNavigator, publication)
      if (
        !generation.isCurrent(expectedGeneration) ||
        currentNavigator !== navigator ||
        publication !== activePublication ||
        currentReaderState != StableReaderState.READY
      ) {
        return navigationGenerationChangedResult()
      }
      val expectedLocator = when (destination) {
        is NavigationDestination.InvalidTarget -> null
        is NavigationDestination.PublicationLink -> publication.locatorFromLink(destination.link)
        is NavigationDestination.Target -> destination.locator
      }
      expectedLocator?.let(::authorizeProgrammaticNavigation)
      val success = when (destination) {
        is NavigationDestination.InvalidTarget -> return navigationErrorResult(
          code = "INVALID_LOCATOR",
          message = destination.message,
        )
        is NavigationDestination.PublicationLink -> currentNavigator.go(
          destination.link,
          animated,
        )
        is NavigationDestination.Target -> currentNavigator.go(destination.locator, animated)
      }
      if (
        !generation.isCurrent(expectedGeneration) ||
        currentNavigator !== navigator ||
        publication !== activePublication ||
        currentReaderState != StableReaderState.READY
      ) {
        return navigationGenerationChangedResult()
      }
      val outcome = NavigationPolicy.outcome(NavigationCommandKind.JUMP, success)
      if (outcome is NavigationCommandOutcome.Failure) {
        clearProgrammaticNavigationAuthorization()
        return navigationErrorResult(
          code = outcome.code,
          message = "The native navigator could not move to the requested location.",
        )
      }
      var settledLocator = if (expectedLocator != null) {
        awaitNavigationSettlement(
          currentNavigator,
          expectedLocator,
          NAVIGATION_INITIAL_SETTLEMENT_TIMEOUT_MILLISECONDS,
        )
      } else {
        currentNavigator.currentLocator.value
      }
      if (
        expectedLocator != null &&
        settledLocator == null &&
        generation.isCurrent(expectedGeneration) &&
        currentNavigator === navigator &&
        publication === activePublication &&
        currentReaderState == StableReaderState.READY
      ) {
        // Readium Kotlin can accept a jump without moving its WebView after a large
        // decoration/search workload. Release the completed attempt before one
        // idempotent, non-animated retry so the recovery has a fresh command scope.
        if (activeNavigationCommandId == commandId) activeNavigationCommandId = null
        endProgrammaticNavigationActivity(commandId)
        clearProgrammaticNavigationAuthorization()
        commandId = beginProgrammaticNavigationActivity()
        activeNavigationCommandId = commandId
        authorizeProgrammaticNavigation(expectedLocator)
        if (currentNavigator.go(expectedLocator, false)) {
          settledLocator = awaitNavigationSettlement(
            currentNavigator,
            expectedLocator,
            NAVIGATION_RETRY_SETTLEMENT_TIMEOUT_MILLISECONDS,
          )
        }
      }
      if (expectedLocator != null && settledLocator == null) {
        clearProgrammaticNavigationAuthorization()
        return navigationErrorResult(
          code = "NAVIGATION_FAILED",
          message = "The native navigator did not settle at the requested location.",
        )
      }
      requireNotNull(settledLocator)
      emitProgress(settledLocator, "programmatic")
      return mapOf("ok" to true, "value" to true)
    } finally {
      if (activeNavigationCommandId == commandId) activeNavigationCommandId = null
      endProgrammaticNavigationActivity(commandId)
    }
  }

  private suspend fun performLogicalNavigationCommand(
    animated: Boolean,
    forward: Boolean,
  ): Map<String, Any?> {
    commandErrorResult()?.let { return it }
    if (activeNavigationCommandId != null || preferenceUpdateJob != null) {
      return navigationErrorResult(
        code = "NAVIGATION_FAILED",
        message = "Another navigation or preference update is already in progress.",
      )
    }
    val currentNavigator = navigator ?: return publicationDataUnavailableResult()
    val publication = activePublication ?: return publicationDataUnavailableResult()
    val expectedGeneration = generation.value
    val commandId = beginProgrammaticNavigationActivity()
    activeNavigationCommandId = commandId
    try {
      val sourceLocator = currentNavigator.currentLocator.value
      val success = if (forward) {
        currentNavigator.goForward(animated)
      } else {
        currentNavigator.goBackward(animated)
      }
      if (
        !generation.isCurrent(expectedGeneration) ||
        currentNavigator !== navigator ||
        publication !== activePublication ||
        currentReaderState != StableReaderState.READY
      ) {
        return navigationGenerationChangedResult()
      }
      var settledLocator = if (success) {
        withTimeoutOrNull(LOGICAL_NAVIGATION_SETTLEMENT_TIMEOUT_MILLISECONDS) {
          currentNavigator.currentLocator.first { it != sourceLocator }
        }
      } else {
        null
      }
      if (settledLocator == null) {
        val fallbackTarget = logicalFallbackLocator(sourceLocator, publication, forward)
        if (fallbackTarget != null && currentNavigator.go(fallbackTarget, animated)) {
          settledLocator = awaitNavigationSettlement(currentNavigator, fallbackTarget)
            ?.takeIf { it != sourceLocator }
        }
      }
      val didMove = settledLocator != null
      val outcome = NavigationPolicy.outcome(NavigationCommandKind.LOGICAL, didMove)
      if (outcome is NavigationCommandOutcome.Success && outcome.moved) {
        settledLocator?.let { emitProgress(it, "programmatic") }
      }
      return when (outcome) {
        is NavigationCommandOutcome.Success -> mapOf("ok" to true, "value" to outcome.moved)
        is NavigationCommandOutcome.Failure -> navigationErrorResult(
          code = outcome.code,
          message = "The native navigator could not perform logical navigation.",
        )
      }
    } finally {
      if (activeNavigationCommandId == commandId) activeNavigationCommandId = null
      endProgrammaticNavigationActivity(commandId)
    }
  }

  private fun beginProgrammaticNavigationActivity(): Long {
    navigationActivitySerial += 1
    return navigationActivitySerial.also(programmaticNavigationActivityIds::add)
  }

  private fun endProgrammaticNavigationActivity(activityId: Long) {
    programmaticNavigationActivityIds.remove(activityId)
  }

  private fun authorizeProgrammaticNavigation(target: Locator) {
    programmaticNavigationAuthorizationJob?.cancel()
    programmaticNavigationAuthorizationTarget = target
    val expectedGeneration = generation.value
    programmaticNavigationAuthorizationJob = scope.launch {
      delay(PROGRAMMATIC_NAVIGATION_AUTHORIZATION_MILLISECONDS)
      if (generation.isCurrent(expectedGeneration)) {
        programmaticNavigationAuthorizationTarget = null
        programmaticNavigationAuthorizationJob = null
      }
    }
  }

  private fun guardViewportResizeAt(locator: Locator) {
    viewportResizeGuardJob?.cancel()
    viewportResizeTarget = viewportStableLocator(locator)
    val expectedGeneration = generation.value
    viewportResizeGuardJob = scope.launch {
      delay(VIEWPORT_RESIZE_GUARD_MILLISECONDS)
      if (generation.isCurrent(expectedGeneration)) {
        viewportResizeTarget = null
        viewportResizeGuardJob = null
      }
    }
  }

  private fun observePaginatedDrag(event: ReaderDragEvent) {
    if (effectiveReaderLayout() != "paginated") return
    when (event.type) {
      ReaderDragEvent.Type.Start -> {
        if (
          currentReaderState != StableReaderState.READY ||
          isProgrammaticNavigationInFlight ||
          preferenceUpdateJob != null ||
          gestureRollbackTarget != null
        ) return
        paginatedDragSettlementJob?.cancel()
        paginatedDragSettlementJob = null
        paginatedDragAnchor = acceptedUserLocation
        paginatedDragCandidate = null
        paginatedDragInProgress = paginatedDragAnchor != null
      }
      ReaderDragEvent.Type.Move -> Unit
      ReaderDragEvent.Type.End -> {
        if (paginatedDragAnchor == null) return
        paginatedDragInProgress = false
        schedulePaginatedDragSettlement()
      }
    }
  }

  private fun schedulePaginatedDragSettlement() {
    val expectedGeneration = generation.value
    val expectedNavigator = navigator ?: return
    paginatedDragSettlementJob?.cancel()
    paginatedDragSettlementJob = scope.launch {
      delay(PAGINATED_DRAG_SETTLEMENT_MILLISECONDS)
      val anchor = paginatedDragAnchor
      val candidate = paginatedDragCandidate ?: expectedNavigator.currentLocator.value
      clearPaginatedDrag()
      if (
        anchor == null ||
        !generation.isCurrent(expectedGeneration) ||
        expectedNavigator !== navigator ||
        currentReaderState != StableReaderState.READY
      ) return@launch
      if (locatorMatchesTarget(candidate, anchor)) {
        acceptedUserLocation = candidate
        updateAcceptedNavigationUnitMatch(candidate)
        return@launch
      }
      acceptedUserLocation = anchor
      updateAcceptedNavigationUnitMatch(anchor)
      if (!handleUserLocationCandidate(candidate, expectedNavigator)) {
        emitProgress(candidate, pendingUserLocationReason)
      }
    }
  }

  private fun clearPaginatedDrag() {
    paginatedDragSettlementJob?.cancel()
    paginatedDragSettlementJob = null
    paginatedDragAnchor = null
    paginatedDragCandidate = null
    paginatedDragInProgress = false
  }

  private fun clearViewportResizeGuard() {
    viewportResizeGuardJob?.cancel()
    viewportResizeGuardJob = null
    viewportResizeTarget = null
  }

  private fun viewportStableLocator(locator: Locator): Locator = locator.copyWithLocations(
    position = null,
    totalProgression = null,
  )

  private fun isProgrammaticNavigationAuthorized(locator: Locator): Boolean =
    programmaticNavigationAuthorizationTarget?.let { target ->
      locatorMatchesTarget(locator, target)
    } ?: false

  private fun clearProgrammaticNavigationAuthorization() {
    programmaticNavigationAuthorizationJob?.cancel()
    programmaticNavigationAuthorizationJob = null
    programmaticNavigationAuthorizationTarget = null
  }

  private fun publicationLink(href: String, publication: Publication): Link? {
    fun find(links: List<Link>): Link? {
      links.forEach { link ->
        if (link.href.toString() == href || link.url().toString() == href) return link
        find(link.children)?.let { return it }
      }
      return null
    }
    return find(
      publication.tableOfContents +
        publication.readingOrder +
        publication.resources +
        publication.links
    )
  }

  private fun logicalFallbackLocator(
    source: Locator,
    publication: Publication,
    forward: Boolean,
  ): Locator? {
    val positionIndex = source.locations.position?.let { sourcePosition ->
      nativePositions.indexOfFirst { it.locations.position == sourcePosition }
        .takeIf { it >= 0 }
    }
    if (positionIndex != null) {
      val targetIndex = positionIndex + if (forward) 1 else -1
      return nativePositions.getOrNull(targetIndex)
    }

    val resourceIndex = readingOrderIndex(source, publication.readingOrder)
    if (resourceIndex < 0) return null
    val targetIndex = resourceIndex + if (forward) 1 else -1
    return publication.readingOrder.getOrNull(targetIndex)?.let(publication::locatorFromLink)
  }

  private suspend fun awaitNavigationSettlement(
    navigator: EpubNavigatorFragment,
    target: Locator,
    timeoutMilliseconds: Long = NAVIGATION_SETTLEMENT_TIMEOUT_MILLISECONDS,
  ): Locator? {
    if (target.locations.fragments.isEmpty()) {
      return withTimeoutOrNull(timeoutMilliseconds) {
        navigator.currentLocator.first { current -> locatorMatchesTarget(current, target) }
      }
    }
    val deadlineNanoseconds = System.nanoTime() + timeoutMilliseconds * 1_000_000L
    // Readium's fragment jump is dispatched asynchronously in the WebView.
    // Let it enter the renderer queue before asking for the visible element.
    delay(NAVIGATION_FRAGMENT_INITIAL_PROBE_DELAY_MILLISECONDS)
    while (true) {
      val current = navigator.currentLocator.value
      val visible = runCatching { navigator.firstVisibleElementLocator() }.getOrNull()
      val visibleCssSelector = visible?.locations?.toJSON()
        ?.optString("cssSelector")
        ?.takeIf(String::isNotBlank)
      val resourceMatches = resourcePathsMatch(current, target)
      val targetElementVisible = if (resourceMatches) {
        runCatching {
          fragmentTargetIsVisible(navigator, target.locations.fragments)
        }.getOrDefault(false)
      } else {
        false
      }
      if (
        NavigationPolicy.fragmentsSettled(
          resourceMatches = resourceMatches,
          currentFragments = visible?.locations?.fragments ?: emptyList(),
          currentCssSelector = visibleCssSelector,
          targetElementVisible = targetElementVisible,
          targetFragments = target.locations.fragments,
        )
      ) {
        return current
      }
      if (
        (target.locations.position != null ||
          target.locations.progression != null ||
          target.locations.totalProgression != null) &&
        locatorMatchesTarget(current, target)
      ) {
        return current
      }
      // firstVisibleElementLocator() is not cancellable while Readium's renderer
      // is busy. Honor an exact result even if that call crossed the deadline,
      // and only fail the attempt after a returned non-match.
      if (System.nanoTime() >= deadlineNanoseconds) return null
      delay(NAVIGATION_FRAGMENT_PROBE_INTERVAL_MILLISECONDS)
    }
  }

  private suspend fun fragmentTargetIsVisible(
    navigator: EpubNavigatorFragment,
    fragments: List<String>,
  ): Boolean {
    val encodedFragments = JSONArray(fragments).toString()
    val raw = navigator.evaluateJavascript(
      """
        (() => {
          const fragments = $encodedFragments;
          const candidates = [];
          for (const value of fragments) {
            if (typeof value !== 'string') continue;
            const trimmed = value.trim().replace(/^#/, '');
            if (!trimmed) continue;
            candidates.push(trimmed);
            try {
              const decoded = decodeURIComponent(trimmed);
              if (decoded && decoded !== trimmed) candidates.push(decoded);
            } catch {}
          }
          for (const candidate of candidates) {
            const element = document.getElementById(candidate)
              || Array.from(document.getElementsByName(candidate))[0];
            if (!element || typeof element.getBoundingClientRect !== 'function') continue;
            const rect = element.getBoundingClientRect();
            const width = window.innerWidth || document.documentElement.clientWidth || 0;
            const height = window.innerHeight || document.documentElement.clientHeight || 0;
            const intersects = rect.right >= -1 && rect.left <= width + 1
              && rect.bottom >= -1 && rect.top <= height + 1;
            if (intersects) return JSON.stringify({ visible: true });
          }
          return JSON.stringify({ visible: false });
        })()
      """.trimIndent(),
    ) ?: return false
    return parseDiagnosticJson(raw)?.optBoolean("visible", false) == true
  }

  private fun locatorMatchesTarget(current: Locator, target: Locator): Boolean {
    val currentPath = current.href.removeFragment().path?.trimStart('/')
    val targetPath = target.href.removeFragment().path?.trimStart('/')
    val resourceMatches = currentPath != null &&
      targetPath != null &&
      (
        currentPath == targetPath ||
          currentPath.endsWith("/$targetPath") ||
          targetPath.endsWith("/$currentPath")
      )
    return NavigationPolicy.locatorSettled(
      resourceMatches = resourceMatches,
      currentPosition = current.locations.position,
      targetPosition = target.locations.position,
      currentProgression = current.locations.progression,
      targetProgression = target.locations.progression,
      currentTotalProgression = current.locations.totalProgression,
      targetTotalProgression = target.locations.totalProgression,
    )
  }

  private fun navigationGenerationChangedResult(): Map<String, Any?> = mapOf(
    "error" to mapOf(
      "code" to "READER_NOT_READY",
      "message" to "The reader generation changed during navigation.",
      "phase" to "navigate",
      "recoverable" to true,
    ),
    "ok" to false,
  )

  private fun navigationErrorResult(code: String, message: String): Map<String, Any?> = mapOf(
    "error" to mapOf(
      "code" to code,
      "message" to message,
      "phase" to "navigate",
      "recoverable" to true,
    ),
    "ok" to false,
  )

  private fun decorationErrorResult(message: String): Map<String, Any?> = mapOf(
    "error" to mapOf(
      "code" to "NATIVE_INVARIANT_VIOLATION",
      "message" to message,
      "phase" to "render",
      "recoverable" to true,
    ),
    "ok" to false,
  )

  private fun commandErrorResult(): Map<String, Any?>? {
    val code = ReaderEventProtocol.commandErrorCode(currentReaderState, isDisposed) ?: return null
    val destroyed = code == StableReaderCommandErrorCode.READER_DESTROYED
    return mapOf(
      "error" to mapOf(
        "code" to code.wireValue,
        "message" to if (destroyed) {
          "The native reader view has been destroyed."
        } else {
          "The native reader is not ready for commands."
        },
        "phase" to if (destroyed) "close" else "render",
        "recoverable" to !destroyed,
      ),
      "ok" to false,
    )
  }

  private fun imageResourceErrorResult(code: String, message: String): Map<String, Any?> = mapOf(
    "error" to mapOf(
      "code" to code,
      "message" to message,
      "phase" to "resource",
      "recoverable" to true,
    ),
    "ok" to false,
  )

  private fun searchCoordinatorErrorResult(
    error: ReaderSearchCoordinatorException,
  ): Map<String, Any?> = when (error.reason) {
    ReaderSearchCoordinatorException.Reason.CANCELLED ->
      searchErrorResult("The search session was cancelled or replaced.")
    ReaderSearchCoordinatorException.Reason.UNSUPPORTED ->
      searchErrorResult("This publication does not support text search.")
    ReaderSearchCoordinatorException.Reason.INVALID_CURSOR ->
      searchErrorResult("The search page cursor is invalid or has already been consumed.")
    ReaderSearchCoordinatorException.Reason.INVALID_SESSION ->
      searchErrorResult("The search session is no longer active.")
    ReaderSearchCoordinatorException.Reason.PAGE_IN_FLIGHT ->
      searchErrorResult("A search page is already being loaded for this session.")
    ReaderSearchCoordinatorException.Reason.FAILED ->
      searchErrorResult("The publication search failed while reading its content.")
  }

  private fun searchErrorResult(message: String): Map<String, Any?> = mapOf(
    "error" to mapOf(
      "code" to "SEARCH_FAILED",
      "message" to message,
      "phase" to "search",
      "recoverable" to true,
    ),
    "ok" to false,
  )

  private fun publicationDataUnavailableResult(): Map<String, Any?> = mapOf(
    "error" to mapOf(
      "code" to "NATIVE_INVARIANT_VIOLATION",
      "message" to "Publication data is unavailable for the ready reader generation.",
      "phase" to "render",
      "recoverable" to false,
    ),
    "ok" to false,
  )

  private fun parseDiagnosticJson(raw: String): JSONObject? = runCatching {
    when (val parsed = JSONTokener(raw).nextValue()) {
      is JSONObject -> parsed
      is String -> JSONObject(parsed)
      else -> null
    }
  }.getOrNull()

  private fun isCurrent(candidate: Long): Boolean =
    !isDisposed && isAttachedToWindow && generation.isCurrent(candidate)

  private fun emitState(
    state: String,
    code: String? = null,
    phase: String? = null,
    message: String? = null,
    recoverable: Boolean? = null,
    suppliedGeneration: Long? = null,
  ) {
    val emissionGeneration = suppliedGeneration ?: generation.value
    if (!eventGate.accept(state, emissionGeneration)) return
    val sequence = stableEventProtocol.nextEvent(emissionGeneration) ?: return
    currentReaderState = StableReaderState.fromWireValue(state)

    val resources = sessionResources.snapshot()
    val sessionDiagnostics = mutableMapOf<String, Any>(
      "activeSessions" to resources.activeSessions,
      "completedSessions" to resources.completedSessions,
      "forcedReleaseViolations" to resources.forcedReleaseViolations,
      "maximumActiveSessions" to resources.maximumActiveSessions,
      "maximumOwnedAssets" to resources.maximumOwnedAssets,
      "maximumOwnedPublications" to resources.maximumOwnedPublications,
      "maximumSourceLeases" to resources.maximumSourceLeases,
      "memorySampleCount" to resources.memorySamples.size,
      "ownedAssets" to resources.ownedAssets,
      "ownedPublications" to resources.ownedPublications,
      "sourceLeases" to resources.sourceLeases,
    )
    resources.latestMemoryBytes?.let { sessionDiagnostics["latestMemoryBytes"] = it }
    resources.postWarmupGrowthBytes?.let {
      sessionDiagnostics["postWarmupGrowthBytes"] = it
    }
    resources.postWarmupSlopeBytesPerCycle?.let {
      sessionDiagnostics["postWarmupSlopeBytesPerCycle"] = it
    }
    resources.postWarmupMemoryIsBounded?.let {
      sessionDiagnostics["postWarmupMemoryIsBounded"] = it
    }
    val payload = mutableMapOf<String, Any>(
      "state" to state,
      "generation" to emissionGeneration,
      "instanceId" to instanceId,
      "platform" to "android",
      "sequence" to sequence,
      "hasNavigator" to (navigator?.isAdded == true),
      "hostNavigatorCount" to (
        fragmentManager?.fragments?.count {
          it.isAdded && it.tag?.startsWith("native-epub-kit:") == true
        } ?: 0
      ),
      "sessionDiagnostics" to sessionDiagnostics,
    )
    code?.let { payload["code"] = it }
    phase?.let { payload["phase"] = it }
    message?.let { payload["message"] = it }
    recoverable?.let { payload["recoverable"] = it }
    onReaderState(payload)
  }

  private companion object {
    val READIUM_WEB_VIEW_CLASSES = setOf(
      "org.readium.r2.navigator.R2BasicWebView",
      "org.readium.r2.navigator.R2WebView",
    )
    const val SELECTION_ACTION_ID_BASE = 0x4E450000
    const val SELECTION_ACTION_MODE_HIDE_MILLISECONDS = 3_000L
    const val SELECTION_ACTION_MODE_REHIDE_MILLISECONDS = 2_000L
    const val SELECTION_ACTION_MODE_RECREATION_GRACE_MILLISECONDS = 250L
    const val MAXIMUM_FOOTNOTE_HTML_UTF16_UNITS = 65_536
    const val MAXIMUM_FOOTNOTE_TEXT_UTF16_UNITS = 32_768
    const val MAXIMUM_FOOTNOTE_RESOURCE_BYTES = 1_048_576L
    const val MAXIMUM_RESOLVED_IMAGE_BYTES = 32 * 1_024 * 1_024
    const val MAXIMUM_RESOLVED_IMAGE_FILES = 32
    const val MAXIMUM_IMAGE_SOURCE_HANDLES = 256
    const val LOGICAL_NAVIGATION_SETTLEMENT_TIMEOUT_MILLISECONDS = 600L
    const val NAVIGATION_FRAGMENT_INITIAL_PROBE_DELAY_MILLISECONDS = 250L
    const val NAVIGATION_FRAGMENT_PROBE_INTERVAL_MILLISECONDS = 50L
    const val NAVIGATION_INITIAL_SETTLEMENT_TIMEOUT_MILLISECONDS = 1_500L
    const val NAVIGATION_RETRY_SETTLEMENT_TIMEOUT_MILLISECONDS = 10_500L
    const val NAVIGATION_SETTLEMENT_TIMEOUT_MILLISECONDS = 12_000L
    const val NAVIGATOR_READINESS_TIMEOUT_MILLISECONDS = 20_000L
    const val PROGRAMMATIC_NAVIGATION_AUTHORIZATION_MILLISECONDS = 5_000L
    const val PAGINATED_DRAG_SETTLEMENT_MILLISECONDS = 220L
    const val VIEWPORT_RESIZE_GUARD_MILLISECONDS = 1_000L
    const val LOG_TAG = "NativeEpubKit"

    val TYPOGRAPHY_DIAGNOSTIC_SCRIPT = """
      (() => {
      const styleValue = (selector, property) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element)[property] : '';
      };
      const urduContentSelector = 'body :lang(ur), body [lang|="ur"], body .urdu';
      const configuredFamily = styleValue(urduContentSelector, 'fontFamily')
          .split(',')[0].trim().replace(/^['\"]|['\"]$/g, '');
        const target = document.querySelector('p');
        let rangeFinite = false;
        if (target) {
          const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
          const text = walker.nextNode();
          if (text && text.length > 0) {
            const range = document.createRange();
            range.setStart(text, 0);
            range.setEnd(text, Math.min(text.length, 4));
            const rect = range.getBoundingClientRect();
            rangeFinite = [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
              && rect.width >= 0 && rect.height > 0;
          }
        }
        return JSON.stringify({
          markerMode: document.querySelector('style[data-native-epub-kit-typography]')
            ?.getAttribute('data-native-epub-kit-typography') ?? '',
          configuredFamily,
          fontLoaded: configuredFamily.length > 0
            ? document.fonts.check('16px "' + configuredFamily.replace(/"/g, '\\"') + '"')
            : false,
          regularFaceLoaded: configuredFamily.length > 0
            ? document.fonts.check('400 16px "' + configuredFamily.replace(/"/g, '\\"') + '"')
            : false,
          boldFaceLoaded: configuredFamily.length > 0
            ? document.fonts.check('700 16px "' + configuredFamily.replace(/"/g, '\\"') + '"')
            : false,
          fontsStatus: document.fonts.status,
          rootBackgroundColor: styleValue(':root', 'backgroundColor'),
          bodyBackgroundColor: styleValue('body', 'backgroundColor'),
          bodyColor: styleValue('body', 'color'),
          bodyFontFamily: styleValue('body', 'fontFamily'),
          bodyDirection: styleValue('body', 'direction'),
          englishFontFamily: styleValue(':lang(en), [lang|="en"], .english', 'fontFamily'),
          englishDirection: styleValue(':lang(en), [lang|="en"], .english', 'direction'),
          arabicFontFamily: styleValue(':lang(ar), [lang|="ar"], .arabic', 'fontFamily'),
          arabicDirection: styleValue(':lang(ar), [lang|="ar"], .arabic', 'direction'),
        urduFontFamily: styleValue(urduContentSelector, 'fontFamily'),
        urduDirection: styleValue(urduContentSelector, 'direction'),
          quranicFontFamily: styleValue('.quranic', 'fontFamily'),
          quranicDirection: styleValue('.quranic', 'direction'),
          quranicColor: styleValue('.quranic', 'color'),
          linkColor: styleValue('a', 'color'),
          rangeFinite,
          selectionApiAvailable: typeof window.getSelection === 'function'
        });
      })()
    """.trimIndent()
  }
}

private fun JSONObject.toEventValue(): Map<String, Any> = buildMap {
  val iterator = keys()
  while (iterator.hasNext()) {
    val key = iterator.next()
    eventValue(opt(key))?.let { put(key, it) }
  }
}

internal fun JSONObject.toNullableEventValue(): Map<String, Any?> = buildMap {
  val iterator = keys()
  while (iterator.hasNext()) {
    val key = iterator.next()
    put(key, nullableEventValue(this@toNullableEventValue.get(key)))
  }
}

internal fun JSONArray.toNullableEventValue(): List<Any?> = buildList {
  for (index in 0 until length()) {
    add(nullableEventValue(this@toNullableEventValue.get(index)))
  }
}

private fun nullableEventValue(value: Any?): Any? = when (value) {
  null, JSONObject.NULL -> null
  is JSONObject -> value.toNullableEventValue()
  is JSONArray -> value.toNullableEventValue()
  is Boolean, is Number, is String -> value
  else -> value.toString()
}

private fun JSONArray.toEventValue(): List<Any> = buildList {
  for (index in 0 until length()) {
    eventValue(opt(index))?.let(::add)
  }
}

private fun eventValue(value: Any?): Any? = when (value) {
  null, JSONObject.NULL -> null
  is JSONObject -> value.toEventValue()
  is JSONArray -> value.toEventValue()
  is Boolean, is Number, is String -> value
  else -> value.toString()
}
